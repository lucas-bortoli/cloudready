import Checkmark16 from "@carbon/icons/es/checkmark/16.js";
import Close16 from "@carbon/icons/es/close/16.js";
import Renew16 from "@carbon/icons/es/renew/16.js";
import Star16 from "@carbon/icons/es/star/16.js";
import Undo16 from "@carbon/icons/es/undo/16.js";
import View16 from "@carbon/icons/es/view/16.js";
import VolumeUp16 from "@carbon/icons/es/volume--up/16.js";
import WarningAlt16 from "@carbon/icons/es/warning--alt/16.js";
import { For } from "solid-js";
import Button from "../../../../components/button/Button";
import CarbonIcon from "../../../../components/taskbar/CarbonIcon";
import type { Rating } from "../../core/fsrs";

/**

 * Review controls receive values and actions without owning scheduler state.

 */
export interface ReviewControlsProps {
  hasCard: boolean;
  revealed: boolean;
  saving: boolean;
  saveError: boolean;
  canUndo: boolean;
  intervalLabel(rating: Rating): string;
  onEnd?(): void;
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
  const icons = [Renew16, WarningAlt16, Checkmark16, Star16];

  return (
    <div class="@container mx-auto w-full max-w-2xl">
      <div class="grid grid-cols-2 gap-2 @min-[36rem]:grid-cols-4">
        <Button
          variant="danger"
          disabled={!props.onEnd || (props.hasCard && props.revealed) || props.saving}
          onClick={props.onEnd}
          startIcon={<CarbonIcon icon={Close16} />}
        >
          End review
        </Button>
        <Button
          disabled={!props.canUndo || props.saving}
          onClick={props.onUndo}
          startIcon={<CarbonIcon icon={Undo16} />}
        >
          Undo
        </Button>
        <Button
          disabled={!props.hasCard || !props.onReplay || props.saving}
          onClick={props.onReplay}
          startIcon={<CarbonIcon icon={VolumeUp16} />}
        >
          Replay audio
        </Button>
        <Button
          variant="primary"
          disabled={!props.hasCard || props.revealed || props.saving}
          onClick={props.onReveal}
          startIcon={<CarbonIcon icon={View16} />}
        >
          Show answer
        </Button>
        <For each={ratings}>
          {(rating) => (
            <Button
              disabled={!props.hasCard || !props.revealed || props.saving || props.saveError}
              onClick={props.onRate.bind(null, rating)}
              startIcon={<CarbonIcon icon={icons[rating - 1]} />}
            >
              {labels[rating - 1]} · {props.intervalLabel(rating)}
            </Button>
          )}
        </For>
      </div>
    </div>
  );
}
