import Trophy32 from "@carbon/icons/es/trophy/32.js";
import { Show } from "solid-js";
import Button from "../../../../components/button/Button";
import CarbonIcon from "../../../../components/taskbar/CarbonIcon";
import Flashcard from "../flashcard/Flashcard";

export interface ReviewCompletionProps {
  reviewedCount: number;
  nextReview?: string;
  canUndo: boolean;
  onUndo: () => void;
  onDone: () => void;
}

/** Summarizes the session after the last card leaves the queue. */
export default function ReviewCompletion(props: ReviewCompletionProps) {
  const reviewedLabel = () => {
    if (props.reviewedCount === 1) return "1 card reviewed";
    return `${props.reviewedCount} cards reviewed`;
  };

  return (
    <>
      <Flashcard class="mx-auto" showBack={false}>
        {() => (
          <div
            role="status"
            class="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          >
            <Show
              when={props.reviewedCount > 0}
              fallback={<h2 class="text-2xl font-semibold">All caught up</h2>}
            >
              <div class="grid size-16 place-items-center rounded-full bg-amber-100 text-amber-800">
                <CarbonIcon icon={Trophy32} />
              </div>
              <h2 class="text-2xl font-semibold">Review complete!</h2>
              <p class="text-lg font-medium">{reviewedLabel()}</p>
            </Show>
            <Show when={props.nextReview}>
              <p class="text-neutral-600">Next review: {props.nextReview}</p>
            </Show>
          </div>
        )}
      </Flashcard>
      <div class="@container mx-auto w-full max-w-2xl">
        {/* Reserve the same space as the review controls for both grid layouts. */}
        <div class="flex min-h-34 flex-wrap items-start justify-center gap-2 @min-[36rem]:min-h-16">
          <Show when={props.canUndo}>
            <Button variant="ghost" onClick={props.onUndo}>
              Undo
            </Button>
          </Show>
          <Button variant="primary" onClick={props.onDone}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}
