import { batch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import generateUuid from "../../../lib/uuid";
import { newCard, schedule, type Rating } from "../core/fsrs";
import type { FlashcardDeck, SubjectProgress } from "../core/learning-program";
import {
  rateSubjectCard,
  subjectReviewQueue,
  type SubjectReviewCard,
} from "../core/subject-review";
import type { OpenSubjectEntry } from "./createSubjectController";

/** Manages a deck overview and a review session against the open subject draft. */
export function createSubjectReviewController(
  entry: Pick<OpenSubjectEntry, "progress" | "updateProgress">,
  decks: readonly FlashcardDeck[],
  startImmediately = false,
) {
  const [now, setNow] = createSignal(Date.now());
  const [active, setActive] = createSignal(startImmediately);
  const [selected, setSelected] = createSignal<SubjectReviewCard>();
  const [revealedCard, setRevealedCard] = createSignal<SubjectReviewCard>();
  const [reviewedCount, setReviewedCount] = createSignal(0);
  const [lastRating, setLastRating] = createSignal<{
    card: SubjectReviewCard;
    previous: SubjectProgress;
    rated: SubjectProgress;
  }>();

  const timer = window.setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => window.clearInterval(timer));

  const queue = createMemo(() => subjectReviewQueue(decks, entry.progress(), now()));
  const card = createMemo<SubjectReviewCard | undefined>((previous) => {
    if (!active()) return undefined;
    const current = selected();
    const cards = queue().cards;
    // Queue entries are rebuilt on each tick. Retain the visible entry by its card.
    if (current && cards.some((entry) => entry.card === current.card)) return current;
    if (previous && cards.some((entry) => entry.card === previous.card)) return previous;
    return cards[0];
  });
  // Another window can move the current card out of the shared queue.
  createEffect(
    on(
      card,
      (current) => {
        setRevealedCard(undefined);
        if (selected() !== current) setSelected(undefined);
      },
      { defer: true },
    ),
  );
  const revealed = () => !!card() && card() === revealedCard();
  const canUndo = () => lastRating()?.rated === entry.progress();

  const start = (): void => {
    setNow(Date.now());
    if (!queue().cards.length) return;
    setSelected(queue().cards[0]);
    setActive(true);
  };

  const end = (): void => {
    batch(() => {
      setActive(false);
      setSelected(undefined);
      setRevealedCard(undefined);
      setLastRating(undefined);
      setReviewedCount(0);
    });
  };

  const reveal = (): void => {
    const current = card();
    if (!current) return;
    setRevealedCard(current);
  };

  const rate = (rating: Rating): void => {
    const current = card();
    if (!current || !revealed()) return;
    const previous = entry.progress();
    const timestamp = Date.now();
    const rated = rateSubjectCard(
      previous,
      current.deck.id,
      current.card.id,
      rating,
      timestamp,
      generateUuid(),
    );
    batch(() => {
      setLastRating({ card: current, previous, rated });
      setRevealedCard(undefined);
      setSelected(undefined);
      setNow(timestamp);
      entry.updateProgress(rated);
      setReviewedCount((count) => count + 1);
    });
  };

  const undo = (): void => {
    const last = lastRating();
    if (!last || !canUndo()) return;
    batch(() => {
      // Only restore a snapshot while it is still the draft’s latest edit.
      entry.updateProgress(last.previous);
      setSelected(last.card);
      setRevealedCard(undefined);
      setLastRating(undefined);
      setReviewedCount((count) => count - 1);
    });
  };

  const intervalLabel = (rating: Rating): string => {
    const current = card();
    if (!current) return "";
    const cards = entry.progress().cards;
    let state = newCard();
    if (Object.hasOwn(cards, current.card.id)) state = cards[current.card.id].state;
    const timestamp = now();
    const interval = schedule(state, rating, timestamp).card.due - timestamp;
    if (interval < 3600000) return `${Math.round(interval / 60000)}m`;
    if (interval < 86400000) return `${Math.round(interval / 3600000)}h`;
    return `${Math.round(interval / 86400000)}d`;
  };

  return {
    active,
    queue,
    card,
    revealed,
    reviewedCount,
    canUndo,
    start,
    end,
    reveal,
    rate,
    undo,
    intervalLabel,
  };
}
