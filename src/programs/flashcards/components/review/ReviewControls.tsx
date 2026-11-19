import { For, Show } from "solid-js";
import Button from "../../../../components/button/Button";
import type { Rating } from "../../core/fsrs";

/**

 * Review controls receive values and actions without owning scheduler state.

 */
export interface ReviewControlsProps {
  revealed: boolean;
  saving: boolean;
  saveError: boolean;
  canUndo: boolean;
  intervalLabel(rating: Rating): string;
  onReplay?(): void;
  onReveal(): void;
  onRate(rating: Rating): void;
  onUndo(): void;
}

/**

 * Displays actions for the visible side of a card.

 */
export default function ReviewControls(props: ReviewControlsProps) {
  const ratings: Rating[] = [1, 2, 3, 4];
  const labels = ["Again", "Hard", "Good", "Easy"];
  return (
    <div class="flex flex-wrap justify-center gap-2">
      <Show when={props.onReplay}>
        <Button onClick={props.onReplay}>Replay audio</Button>
      </Show>
      <Show
        when={props.revealed}
        fallback={
          <Button variant="primary" onClick={props.onReveal}>
            Show answer
          </Button>
        }
      >
        <For each={ratings}>
          {(rating) => (
            <Button
              disabled={props.saving || props.saveError}
              onClick={props.onRate.bind(null, rating)}
            >
              {labels[rating - 1]} · {props.intervalLabel(rating)}
            </Button>
          )}
        </For>
      </Show>
      <Button disabled={!props.canUndo || props.saving} onClick={props.onUndo}>
        Undo
      </Button>
    </div>
  );
}
