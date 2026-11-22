import { createRoot, createSignal, flush } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FlashcardDeck, SubjectProgress } from "../core/learning-program";
import { emptySubjectProgress, rateSubjectCard } from "../core/subject-review";
import { createSubjectReviewController } from "./createSubjectReviewController";

const deck: FlashcardDeck = {
  id: "deck",
  type: "flashcard-deck",
  title: "Review",
  cards: [{ id: "card", front: "Question", back: "Answer" }],
};
const now = Date.parse("2026-11-19T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

function mountReview(initial: SubjectProgress, currentDeck = deck) {
  return createRoot((dispose) => {
    const [progress, updateProgress] = createSignal(initial);
    const entry = { progress, updateProgress };
    const review = createSubjectReviewController(entry, [currentDeck]);
    return { dispose, progress, review };
  });
}

it("undoes the first rating even after the review queue is empty", () => {
  const initial = emptySubjectProgress("UTC");
  const { dispose, progress, review } = mountReview(initial);
  try {
    review.start();
    flush();
    review.rate(3);
    flush();
    expect(progress()).toBe(initial);
    review.reveal();
    flush();
    review.rate(3);
    flush();
    expect(progress().introduced).toEqual({ "2026-11-19": { deck: 1 } });
    expect(review.card()).toBeUndefined();
    expect(review.canUndo()).toBe(true);
    review.undo();
    flush();
    expect(progress()).toBe(initial);
    expect(review.card()?.card).toBe(deck.cards[0]);
    expect(review.revealed()).toBe(false);
    expect(review.canUndo()).toBe(false);
  } finally {
    dispose();
  }
});

it("restores the previous schedule and history when undoing a repeat review", () => {
  const initial = rateSubjectCard(
    emptySubjectProgress("UTC"),
    deck.id,
    "card",
    1,
    now - 60000,
    "initial",
  );
  const { dispose, progress, review } = mountReview(initial);
  try {
    review.start();
    flush();
    review.reveal();
    flush();
    review.rate(4);
    flush();
    expect(progress().cards.card.reviews).toHaveLength(2);
    review.undo();
    flush();
    expect(progress().cards.card).toBe(initial.cards.card);
  } finally {
    dispose();
  }
});

it("keeps the next card visible when an earlier review becomes due", () => {
  const other = { id: "other", front: "Other question", back: "Other answer" };
  const initial = rateSubjectCard(
    emptySubjectProgress("UTC"),
    deck.id,
    "other",
    1,
    now - 59000,
    "initial",
  );
  const { dispose, review } = mountReview(initial, { ...deck, cards: [...deck.cards, other] });
  try {
    review.start();
    flush();
    expect(review.card()?.card).toBe(deck.cards[0]);
    vi.advanceTimersByTime(1000);
    flush();
    expect(review.queue().cards[0]?.card).toBe(other);
    expect(review.card()?.card).toBe(deck.cards[0]);
    review.reveal();
    flush();
    review.rate(4);
    flush();
    expect(review.card()?.card).toBe(other);
  } finally {
    dispose();
  }
});
