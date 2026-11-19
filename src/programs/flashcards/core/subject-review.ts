import { newCard, schedule, type Rating } from "./fsrs";
import type { Flashcard, FlashcardDeck, SubjectProgress, TopicItem } from "./learning-program";
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

/** Collects decks from a subject or topic in the order they appear. */
export function collectReviewDecks(items: readonly TopicItem[]): FlashcardDeck[] {
  const decks: FlashcardDeck[] = [];
  function visit(children: readonly TopicItem[]) {
    for (const item of children) {
      if (item.type === "flashcard-deck") decks.push(item);
      if (item.type === "topic") visit(item.items);
    }
  }
  visit(items);
  return decks;
}

/** A queued card and the deck that owns its daily allowance. */
export interface SubjectReviewCard {
  card: Flashcard;
  deck: FlashcardDeck;
}

/** Merges due cards across decks and applies each deck's new-card allowance. */
export function subjectReviewQueue(
  decks: readonly FlashcardDeck[],
  progress: SubjectProgress,
  now: number,
) {
  const due: { entry: SubjectReviewCard; time: number }[] = [];
  const fresh: SubjectReviewCard[] = [];
  const introductions = progress.introduced[studyDate(now, progress.timezone)];
  let nextDue: number | undefined;
  for (const deck of decks) {
    let limit = 20;
    if (Object.hasOwn(progress.dailyLimit, deck.id)) limit = progress.dailyLimit[deck.id];
    if (introductions && Object.hasOwn(introductions, deck.id)) limit -= introductions[deck.id];
    for (const card of deck.cards) {
      const state = Object.hasOwn(progress.cards, card.id) && progress.cards[card.id].state;
      if (!state || state.phase === "new") {
        if (limit > 0) {
          fresh.push({ card, deck });
          limit -= 1;
        }
      } else if (state.due <= now) {
        due.push({ entry: { card, deck }, time: state.due });
      } else if (nextDue === undefined || state.due < nextDue) {
        nextDue = state.due;
      }
    }
  }

  // Stable sorting keeps traversal order when two cards have the same due time.
  due.sort((a, b) => a.time - b.time);
  return {
    cards: due.map(({ entry }) => entry).concat(fresh),
    due: due.length,
    fresh: fresh.length,
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
