import { batch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import generateUuid from "../../../lib/uuid";
import { newCard, schedule, type Rating } from "../core/fsrs";
import type { Flashcard, FlashcardDeck, SubjectProgress } from "../core/learning-program";
import { rateSubjectCard, subjectReviewQueue } from "../core/subject-review";
import type { OpenSubjectEntry } from "./createSubjectController";

/** Manages a deck overview and a review session against the open subject draft. */
export function createSubjectReviewController(
  entry: Pick<OpenSubjectEntry, "progress" | "updateProgress">,
  deck: FlashcardDeck,
) {
  const [now, setNow] = createSignal(Date.now());
  const [active, setActive] = createSignal(false);
  const [selected, setSelected] = createSignal<Flashcard>();
  const [revealedCard, setRevealedCard] = createSignal<Flashcard>();
  const [lastRating, setLastRating] = createSignal<{
    card: Flashcard;
    previous: SubjectProgress;
    rated: SubjectProgress;
  }>();

  const timer = window.setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => window.clearInterval(timer));

  const queue = createMemo(() => subjectReviewQueue(deck, entry.progress(), now()));
  const card = createMemo<Flashcard | undefined>((previous) => {
    if (!active()) return undefined;
    const current = selected();
    const cards = queue().cards;
    if (current && cards.includes(current)) return current;
    if (previous && cards.includes(previous)) return previous;
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
    const rated = rateSubjectCard(previous, deck.id, current.id, rating, timestamp, generateUuid());
    batch(() => {
      setLastRating({ card: current, previous, rated });
      setRevealedCard(undefined);
      setSelected(undefined);
      setNow(timestamp);
      entry.updateProgress(rated);
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
    });
  };

  const intervalLabel = (rating: Rating): string => {
    const current = card();
    if (!current) return "";
    const cards = entry.progress().cards;
    let state = newCard();
    if (Object.hasOwn(cards, current.id)) state = cards[current.id].state;
    const timestamp = now();
    const interval = schedule(state, rating, timestamp).card.due - timestamp;
    if (interval < 3600000) return `${Math.round(interval / 60000)}m`;
    if (interval < 86400000) return `${Math.round(interval / 3600000)}h`;
    return `${Math.round(interval / 86400000)}d`;
  };

  return { active, queue, card, revealed, canUndo, start, end, reveal, rate, undo, intervalLabel };
}
