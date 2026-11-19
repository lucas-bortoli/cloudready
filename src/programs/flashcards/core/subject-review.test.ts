import { expect, it } from "vitest";
import { newCard, type Rating } from "./fsrs";
import type { FlashcardDeck } from "./learning-program";
import { emptySubjectProgress, rateSubjectCard, subjectReviewQueue } from "./subject-review";

const deck: FlashcardDeck = {
  id: "deck",
  type: "flashcard-deck",
  title: "Test deck",
  cards: ["fresh-a", "later", "earlier", "fresh-b"].map((id) => ({ id, front: id, back: id })),
};
const midnight = Date.parse("2026-11-19T03:00:00Z");

it("orders due cards by time, preserves new-card order, and resets the daily allowance locally", () => {
  const progress = emptySubjectProgress("America/Sao_Paulo");
  const now = midnight - 1;
  const previous = rateSubjectCard(progress, deck.id, "earlier", 4, now, "first");
  const rated = rateSubjectCard(previous, deck.id, "later", 4, midnight, "second");
  const firstDue = rated.cards.earlier.state.due;
  expect(subjectReviewQueue(deck, rated, now).nextDue).toBe(firstDue);
  const queue = subjectReviewQueue(deck, rated, firstDue + 1);
  expect(queue.cards.map((card) => card.id)).toEqual(["earlier", "later", "fresh-a", "fresh-b"]);

  expect(subjectReviewQueue(deck, previous, now).fresh).toBe(3);
  previous.dailyLimit = { deck: 1 };
  expect(subjectReviewQueue(deck, previous, now).fresh).toBe(0);
  expect(subjectReviewQueue(deck, previous, midnight).cards[0]?.id).toBe("fresh-a");
});

it.each<Rating>([1, 2, 3, 4])(
  "records rating %s and preserves other subject progress",
  (rating) => {
    const progress = emptySubjectProgress("UTC");
    progress.lessons.lesson = { completed: true, timeSpentSeconds: 5 };
    const first = rateSubjectCard(progress, deck.id, "earlier", rating, midnight, "first");
    const second = rateSubjectCard(
      first,
      deck.id,
      "earlier",
      rating,
      first.cards.earlier.state.due,
      "second",
    );
    expect(first.cards.earlier.reviews).toEqual([
      {
        id: "first",
        rating,
        reviewedAt: midnight,
        previous: newCard(),
      },
    ]);
    expect(second.cards.earlier.reviews[1].previous).toEqual(first.cards.earlier.state);
    expect(second.introduced).toEqual({ "2026-11-19": { deck: 1 } });
    expect(second.lessons).toBe(progress.lessons);
    expect(progress.cards).toEqual({});
  },
);
