import { batch, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import Button from "../../../../components/button/Button";
import type { Rating } from "../../core/fsrs";
import type { FlashcardDeck } from "../../core/learning-program";
import type { SubjectReviewCard } from "../../core/subject-review";
import type { OpenSubjectEntry } from "../../ui/createSubjectController";
import { createSubjectReviewController } from "../../ui/createSubjectReviewController";
import Flashcard from "../flashcard/Flashcard";
import { UserHtml } from "../user-html/UserHtml";
import ReviewCompletion from "./ReviewCompletion";
import ReviewControls from "./ReviewControls";

/** The decks and actions for a subject review. */
export interface SubjectDeckReviewProps {
  entry: OpenSubjectEntry;
  title: string;
  decks: readonly FlashcardDeck[];
  onSelect: (id: string) => void;
  onEnd?: () => void;
}

/** Displays the same review controls for a single deck or a collection of decks. */
export function SubjectDeckReview(props: SubjectDeckReviewProps) {
  // The keyed route owns this controller and remounts it when the subject or deck changes.
  const review = untrack(() =>
    createSubjectReviewController(props.entry, props.decks, !!props.onEnd),
  );
  const nextReview = createMemo(() => {
    const next = review.queue().nextDue;
    if (next !== undefined) return new Date(next).toLocaleString();
  });

  const [outgoing, setOutgoing] = createSignal<{ card: SubjectReviewCard; revealed: boolean }>();
  const displayedCard = () => outgoing()?.card ?? review.card();
  const displayedBack = () => outgoing()?.revealed ?? review.revealed();
  let transitionTimer: number | undefined;

  onCleanup(() => window.clearTimeout(transitionTimer));

  const transitionToNextCard = (action: () => void) => {
    if (outgoing()) return;
    const current = review.card();
    if (!current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      action();
      return;
    }
    // Keep the old face mounted while the review queue advances behind it.
    batch(() => {
      setOutgoing({ card: current, revealed: review.revealed() });
      action();
      if (review.card() === current) setOutgoing(undefined);
    });
    if (outgoing()) transitionTimer = window.setTimeout(() => setOutgoing(undefined), 180);
  };

  const handleRate = (rating: Rating) => transitionToNextCard(() => review.rate(rating));
  const handleUndo = () => transitionToNextCard(review.undo);

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
      <h1 class="text-3xl">{props.title}</h1>
      <p role="status" class="text-neutral-500">
        {props.decks.reduce((total, deck) => total + deck.cards.length, 0)} cards ·{" "}
        {review.queue().due} due · {review.queue().fresh} new available
      </p>
      <Show
        when={review.active()}
        fallback={
          <section class="flex w-full max-w-2xl flex-col items-end gap-4 rounded-lg border border-sky-100 bg-sky-50 p-5">
            <div class="flex w-full flex-col gap-1">
              <Show
                when={review.queue().cards.length}
                fallback={
                  <>
                    <h2 class="text-lg font-medium text-sky-950">All caught up</h2>
                    <p class="text-sky-900">No cards are available now.</p>
                    <Show when={nextReview()}>
                      <p class="text-sky-900">Next review {nextReview()}.</p>
                    </Show>
                  </>
                }
              >
                <h2 class="text-lg font-medium text-sky-950">Ready to review?</h2>
                <p class="text-sky-900">Take a moment to practice your cards.</p>
              </Show>
            </div>
            <Button
              variant="primary"
              disabled={!review.queue().cards.length}
              onClick={review.start}
            >
              Start review
            </Button>
          </section>
        }
      >
        <Show when={displayedCard()} keyed>
          {({ card, deck }) => {
            const visibleHtml = (showBack: boolean) => {
              if (showBack) return card.back;
              return card.front;
            };
            return (
              <Flashcard class="mx-auto" showBack={displayedBack()} leaving={!!outgoing()}>
                {(showBack) => (
                  <>
                    <div class="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 pb-3 text-neutral-600">
                      <span class="font-medium">
                        <Show when={showBack()} fallback="Question">
                          Answer
                        </Show>
                      </span>
                      <Show when={props.onEnd}>
                        <span class="truncate text-neutral-500">{deck.title}</span>
                      </Show>
                    </div>
                    <UserHtml
                      class="min-h-0 flex-1 overflow-auto text-lg leading-relaxed text-neutral-800"
                      title="Flashcard"
                      html={visibleHtml(showBack())}
                      onSelect={props.onSelect}
                    />
                  </>
                )}
              </Flashcard>
            );
          }}
        </Show>
        <Show
          when={displayedCard()}
          fallback={
            <ReviewCompletion
              reviewedCount={review.reviewedCount()}
              nextReview={nextReview()}
              canUndo={review.canUndo()}
              onUndo={handleUndo}
              onDone={handleEnd}
            />
          }
        >
          <ReviewControls
            hasCard
            revealed={displayedBack()}
            saving={!!outgoing()}
            saveError={false}
            canUndo={review.canUndo()}
            intervalLabel={review.intervalLabel}
            onReveal={review.reveal}
            onRate={handleRate}
            onUndo={handleUndo}
            onEnd={handleEnd}
          />
        </Show>
      </Show>
    </section>
  );
}
