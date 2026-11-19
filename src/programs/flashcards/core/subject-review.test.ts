import { expect, it } from "vitest";
import { newCard, type Rating } from "./fsrs";
import type { FlashcardDeck } from "./learning-program";
import {
  collectReviewDecks,
  emptySubjectProgress,
  rateSubjectCard,
  subjectReviewQueue,
} from "./subject-review";

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
  expect(subjectReviewQueue([deck], rated, now).nextDue).toBe(firstDue);
  const queue = subjectReviewQueue([deck], rated, firstDue + 1);
  expect(queue.cards.map(({ card }) => card.id)).toEqual([
    "earlier",
    "later",
    "fresh-a",
    "fresh-b",
  ]);

  expect(subjectReviewQueue([deck], previous, now).fresh).toBe(3);
  previous.dailyLimit = { deck: 1 };
  expect(subjectReviewQueue([deck], previous, now).fresh).toBe(0);
  expect(subjectReviewQueue([deck], previous, midnight).cards[0]?.card.id).toBe("fresh-a");
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

it("collects only decks under the supplied scope in display order", () => {
  const second = { ...deck, id: "second" };
  const sibling = { ...deck, id: "sibling" };
  const topic = {
    type: "topic" as const,
    title: "Topic",
    id: "topic",
    items: [deck, { type: "topic" as const, title: "Nested", id: "nested", items: [second] }],
  };
  expect(collectReviewDecks([topic, sibling])).toEqual([deck, second, sibling]);
  expect(collectReviewDecks(topic.items)).toEqual([deck, second]);
});

it("sorts due cards across decks and counts new cards against each deck's allowance", () => {
  const second: FlashcardDeck = {
    ...deck,
    id: "second",
    cards: [
      { id: "other-due", front: "", back: "" },
      { id: "other-new", front: "", back: "" },
    ],
  };
  const progress = emptySubjectProgress("UTC");
  progress.dailyLimit = { deck: 0, second: 2 };
  const first = rateSubjectCard(progress, second.id, "other-due", 1, midnight, "first");
  const rated = rateSubjectCard(first, deck.id, "later", 1, midnight + 1, "second");
  const nextDue = rated.cards["other-due"].state.due;
  rated.dailyLimit.second = 1;
  expect(subjectReviewQueue([deck, second], rated, midnight + 1)).toEqual({
    cards: [],
    due: 0,
    fresh: 0,
    nextDue,
  });
  rated.dailyLimit.second = 2;
  const queue = subjectReviewQueue([deck, second], rated, nextDue + 1);
  expect(queue.cards.map(({ card, deck }) => [card.id, deck.id])).toEqual([
    ["other-due", "second"],
    ["later", "deck"],
    ["other-new", "second"],
  ]);
});
