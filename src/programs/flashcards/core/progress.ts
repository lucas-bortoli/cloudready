import { newCard, schedule, type CardState, type Rating, type ReviewResult } from "./fsrs";
import type { AnkiCard } from "./anki";

/** Persisted records use numeric UTC timestamps and a stored time zone for portable day boundaries. */
export interface Progress {
  version: 1;
  packageHash: string;
  packageName: string;
  scheduler: "fsrs-6-default-v1";
  timezone: string;
  dailyLimit: Record<string, number>;
  introduced: Record<string, Record<string, number>>;
  cards: Record<string, CardState>;
  reviews: Array<{
    id: string;
    cardId: string;
    deckId: string;
    rating: Rating;
    reviewedAt: number;
    previous: CardState;
  }>;
}
/** Indicates corrupt or unsupported progress instead of silently resetting a user's work. */
export class ProgressFormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProgressFormatError";
  }
}

/** Creates an empty, versioned progress document. */
export function emptyProgress(hash: string, name: string, timezone: string): Progress {
  return {
    version: 1,
    packageHash: hash,
    packageName: name,
    scheduler: "fsrs-6-default-v1",
    timezone,
    dailyLimit: {},
    introduced: {},
    cards: {},
    reviews: [],
  };
}
/**
 * Parses a saved progress document without treating malformed data as an empty collection.
 *
 * @throws {ProgressFormatError} If the document is malformed or uses an unsupported version.
 */
export function parseProgress(json: string, hash: string): Progress {
  try {
    const p = JSON.parse(json) as Progress;
    if (
      !p ||
      p.version !== 1 ||
      p.packageHash !== hash ||
      p.scheduler !== "fsrs-6-default-v1" ||
      typeof p.packageName !== "string" ||
      typeof p.timezone !== "string" ||
      !p.cards ||
      typeof p.cards !== "object" ||
      !p.dailyLimit ||
      typeof p.dailyLimit !== "object" ||
      !p.introduced ||
      typeof p.introduced !== "object" ||
      !Array.isArray(p.reviews)
    )
      throw new ProgressFormatError(
        "The saved progress is invalid or from an unsupported version.",
      );
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value);
    const nonnegative = (value: unknown): value is number =>
      typeof value === "number" && Number.isInteger(value) && value >= 0;
    if (!isRecord(p.cards) || !isRecord(p.dailyLimit) || !isRecord(p.introduced))
      throw new ProgressFormatError("The saved progress is invalid.");
    for (const limit of Object.values(p.dailyLimit))
      if (!nonnegative(limit) || limit > 9999)
        throw new ProgressFormatError("The saved daily limit is invalid.");
    for (const [date, days] of Object.entries(p.introduced)) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !isRecord(days) ||
        Object.values(days).some((value) => !nonnegative(value))
      )
        throw new ProgressFormatError("The saved introduction counts are invalid.");
    }
    for (const review of p.reviews) {
      if (
        !isRecord(review) ||
        typeof review.id !== "string" ||
        typeof review.cardId !== "string" ||
        typeof review.deckId !== "string" ||
        ![1, 2, 3, 4].includes(review.rating as number) ||
        !Number.isFinite(review.reviewedAt) ||
        !isRecord(review.previous)
      )
        throw new ProgressFormatError("The saved review history is invalid.");
    }
    new Intl.DateTimeFormat("en", { timeZone: p.timezone });
    for (const card of Object.values(p.cards)) {
      if (
        !card ||
        !["learning", "review", "relearning"].includes(card.phase) ||
        !Number.isFinite(card.due) ||
        !Number.isFinite(card.lastReview) ||
        !Number.isFinite(card.stability) ||
        card.stability < 0.001 ||
        !Number.isFinite(card.difficulty) ||
        card.difficulty < 1 ||
        card.difficulty > 10 ||
        !Number.isInteger(card.step) ||
        card.step < 0 ||
        !Number.isInteger(card.repetitions) ||
        card.repetitions < 1 ||
        !Number.isInteger(card.lapses) ||
        card.lapses < 0 ||
        !Number.isInteger(card.scheduledDays) ||
        card.scheduledDays < 0
      )
        throw new ProgressFormatError("The saved card state is invalid.");
    }
    return p;
  } catch (cause) {
    if (cause instanceof ProgressFormatError) throw cause;
    throw new ProgressFormatError("The saved progress could not be read.");
  }
}
/** Returns a stable YYYY-MM-DD date in the profile's study time zone. */
export function studyDate(now: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  // Joining named parts avoids relying on the browser's locale-specific order.
  const part = (name: string) => parts.find((value) => value.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/**
 * Lists due cards first, then new cards in the order supplied by Anki.
 * Introductions are limited per deck and date; a card is counted only once.
 */
export function reviewQueue(
  cards: AnkiCard[],
  progress: Progress,
  deckId: string,
  now: number,
): AnkiCard[] {
  const day = studyDate(now, progress.timezone);
  const relevant = cards.filter((c) => c.deckId === deckId);
  const due = relevant
    .filter((c) => progress.cards[c.id] && progress.cards[c.id].due <= now)
    .sort(
      (a, b) => progress.cards[a.id].due - progress.cards[b.id].due || a.id.localeCompare(b.id),
    );
  const available = Math.max(
    0,
    (progress.dailyLimit[deckId] ?? 20) - (progress.introduced[day]?.[deckId] ?? 0),
  );
  const fresh = relevant
    .filter((c) => !progress.cards[c.id])
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .slice(0, available);
  return due.concat(fresh);
}
/** Returns an immutable update and a review record for one rating. */
export function rateCard(
  progress: Progress,
  card: AnkiCard,
  rating: Rating,
  now: number,
  id: string,
): { progress: Progress; result: ReviewResult } {
  const previous = progress.cards[card.id] ?? newCard();
  const result = schedule(previous, rating, now);
  const introduced = structuredClone(progress.introduced);
  if (previous.phase === "new") {
    const date = studyDate(now, progress.timezone);
    introduced[date] ??= {};
    introduced[date][card.deckId] = (introduced[date][card.deckId] ?? 0) + 1;
  }
  return {
    progress: {
      ...progress,
      introduced,
      cards: { ...progress.cards, [card.id]: result.card },
      reviews: [
        ...progress.reviews,
        {
          id,
          cardId: card.id,
          deckId: card.deckId,
          rating,
          reviewedAt: now,
          previous: result.review.previous,
        },
      ],
    },
    result,
  };
}
