import { createMemo, Show, untrack } from "solid-js";
import Button from "../../../../components/button/Button";
import type { FlashcardDeck } from "../../core/learning-program";
import type { OpenSubjectEntry } from "../../ui/createSubjectController";
import { createSubjectReviewController } from "../../ui/createSubjectReviewController";
import { UserHtml } from "../user-html/UserHtml";
import ReviewControls from "./ReviewControls";

/** Displays the same review controls for a single deck or a collection of decks. */
export function SubjectDeckReview(props: {
  entry: OpenSubjectEntry;
  title: string;
  decks: readonly FlashcardDeck[];
  onSelect: (id: string) => void;
  onEnd?: () => void;
}) {
  // The keyed route owns this controller and remounts it when the subject or deck changes.
  const review = untrack(() =>
    createSubjectReviewController(props.entry, props.decks, !!props.onEnd),
  );
  const nextReview = createMemo(() => {
    const next = review.queue().nextDue;
    if (next !== undefined) return new Date(next).toLocaleString();
  });

  const handleEnd = () => {
    if (props.onEnd) {
      props.onEnd();
    } else {
      review.end();
    }
  };

  return (
    <section
      x-role="flashcard-deck"
      class="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto p-4"
    >
      <h1 class="text-2xl">{props.title}</h1>
      <p role="status">
        {props.decks.reduce((total, deck) => total + deck.cards.length, 0)} cards ·{" "}
        {review.queue().due} due · {review.queue().fresh} new available
      </p>
      <Show when={!review.queue().cards.length}>
        <p>No cards are available now.</p>
        <Show when={nextReview()}>
          <p>Next review {nextReview()}.</p>
        </Show>
      </Show>
      <Show
        when={review.active()}
        fallback={
          <Button
            class="min-h-10 self-start"
            variant="primary"
            disabled={!review.queue().cards.length}
            onClick={review.start}
          >
            Start review
          </Button>
        }
      >
        <Show when={review.card()} keyed>
          {({ card, deck }) => {
            const visibleHtml = () => {
              if (review.revealed()) return card.back;
              return card.front;
            };
            return (
              <div class="flex min-h-48 flex-1 flex-col">
                <Show when={props.onEnd}>
                  <p class="mb-2 text-sm">{deck.title}</p>
                </Show>
                <UserHtml title="Flashcard" html={visibleHtml()} onSelect={props.onSelect} />
              </div>
            );
          }}
        </Show>
        <Show when={review.card()}>
          <div class="[&_button]:min-h-10">
            <ReviewControls
              revealed={review.revealed()}
              saving={false}
              saveError={false}
              canUndo={review.canUndo()}
              intervalLabel={review.intervalLabel}
              onReveal={review.reveal}
              onRate={review.rate}
              onUndo={review.undo}
            />
          </div>
        </Show>
        <div class="flex flex-wrap gap-2">
          <Show when={!review.card()}>
            <Button class="min-h-10" disabled={!review.canUndo()} onClick={review.undo}>
              Undo last rating
            </Button>
          </Show>
          <Button class="min-h-10" variant="ghost" onClick={handleEnd}>
            End review
          </Button>
        </div>
      </Show>
    </section>
  );
}
