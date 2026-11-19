import { createMemo, Show, untrack } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import ReviewControls from "../../../../../../components/review/ReviewControls";
import { SubjectHtmlView } from "../../../../../../components/subjects/SubjectHtmlView";
import { useCurrentSubjectEntry } from "../../../../../../components/subjects/useCurrentSubject";
import type { FlashcardDeck } from "../../../../../../core/learning-program";
import type { OpenSubjectEntry } from "../../../../../../ui/createSubjectController";
import { createSubjectReviewController } from "../../../../../../ui/createSubjectReviewController";

/** The routed deck and navigation callback for links in its cards. */
export interface FlashcardDeckPageProps {
  deck: FlashcardDeck;
  onSelect: (id: string) => void;
}

/** Opens a new review session when the routed subject or deck changes. */
export default function FlashcardDeckPage(props: FlashcardDeckPageProps) {
  const subject = useCurrentSubjectEntry();
  const route = createMemo(() => {
    const entry = subject();
    if (entry) return { entry, deck: props.deck };
  });

  return (
    <Show when={route()} keyed>
      {(current) => (
        <DeckReview entry={current.entry} deck={current.deck} onSelect={props.onSelect} />
      )}
    </Show>
  );
}

function DeckReview(props: FlashcardDeckPageProps & { entry: OpenSubjectEntry }) {
  // The keyed route owns this controller and remounts it when the subject or deck changes.
  const review = untrack(() => createSubjectReviewController(props.entry, props.deck));
  const nextReview = createMemo(() => {
    const next = review.queue().nextDue;
    if (next !== undefined) return new Date(next).toLocaleString();
  });

  return (
    <section
      x-role="flashcard-deck"
      class="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto p-4"
    >
      <h1 class="text-2xl">{props.deck.title}</h1>
      <p role="status">
        {props.deck.cards.length} cards · {review.queue().due} due · {review.queue().fresh} new
        available
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
          {(card) => {
            const visibleHtml = () => {
              if (review.revealed()) return card.back;
              return card.front;
            };
            return (
              <div class="flex min-h-48 flex-1 flex-col">
                <SubjectHtmlView
                  subject={props.entry.subject}
                  title="Flashcard"
                  html={visibleHtml()}
                  onSelect={props.onSelect}
                />
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
          <Button class="min-h-10" variant="ghost" onClick={review.end}>
            End review
          </Button>
        </div>
      </Show>
    </section>
  );
}
