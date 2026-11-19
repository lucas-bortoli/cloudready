import { newCard, schedule, type Rating } from "./fsrs";
import type { Flashcard, FlashcardDeck, SubjectProgress } from "./learning-program";
import { studyDate } from "./progress";

/** Creates the learner progress document for a subject with no saved progress. */
export function emptySubjectProgress(timezone: string): SubjectProgress {
  return {
    timezone,
    scheduler: "fsrs-6-default-v1",
    cards: {},
    dailyLimit: {},
    introduced: {},
    lessons: {},
    exerciseSets: {},
    deckTimeSpentSeconds: {},
  };
}

/** Lists due cards and the new cards that fit within the deck’s daily allowance. */
export function subjectReviewQueue(deck: FlashcardDeck, progress: SubjectProgress, now: number) {
  const due: { card: Flashcard; time: number }[] = [];
  const fresh: Flashcard[] = [];
  let nextDue: number | undefined;
  for (const card of deck.cards) {
    const state = Object.hasOwn(progress.cards, card.id) && progress.cards[card.id].state;
    if (!state || state.phase === "new") {
      fresh.push(card);
    } else if (state.due <= now) {
      due.push({ card, time: state.due });
    } else if (nextDue === undefined || state.due < nextDue) {
      nextDue = state.due;
    }
  }

  const day = studyDate(now, progress.timezone);
  const limit = Object.hasOwn(progress.dailyLimit, deck.id) ? progress.dailyLimit[deck.id] : 20;
  const introductions = progress.introduced[day];
  const introduced =
    introductions && Object.hasOwn(introductions, deck.id) ? introductions[deck.id] : 0;
  const available = fresh.slice(0, Math.max(0, limit - introduced));
  due.sort((a, b) => a.time - b.time);

  return {
    cards: due.map(({ card }) => card).concat(available),
    due: due.length,
    fresh: available.length,
    nextDue,
  };
}

/** Records a rating and returns a new draft without mutating saved progress. */
export function rateSubjectCard(
  progress: SubjectProgress,
  deckId: string,
  cardId: string,
  rating: Rating,
  now: number,
  reviewId: string,
): SubjectProgress {
  const record = Object.hasOwn(progress.cards, cardId) ? progress.cards[cardId] : undefined;
  const previous = record?.state ?? newCard();
  const result = schedule(previous, rating, now);
  let introduced = progress.introduced;
  if (previous.phase === "new") {
    const day = studyDate(now, progress.timezone);
    const counts = introduced[day] ?? {};
    const count = Object.hasOwn(counts, deckId) ? counts[deckId] : 0;
    introduced = { ...introduced, [day]: { ...counts, [deckId]: count + 1 } };
  }

  return {
    ...progress,
    introduced,
    cards: {
      ...progress.cards,
      [cardId]: {
        state: result.card,
        reviews: [
          ...(record?.reviews ?? []),
          { id: reviewId, rating, reviewedAt: now, previous: result.review.previous },
        ],
      },
    },
  };
}
