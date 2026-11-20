import { Show } from "solid-js";
import Button from "../../../../components/button/Button";
import type { AnkiCard } from "../../core/anki";
import type { Rating } from "../../core/fsrs";
import type { RenderedCard } from "../../core/template";
import type { QueueSummary } from "../../ui/createReviewController";
import CardContent from "./CardContent";
import ReviewControls from "./ReviewControls";

/**

 * Values and actions required to review the selected deck.

 */
export interface ReviewViewProps {
  deckName: string;
  summary: QueueSummary;
  dailyLimit: number;
  card: AnkiCard | undefined;
  rendered: RenderedCard | undefined;
  media: Record<string, Uint8Array>;
  revealed: boolean;
  saving: boolean;
  saveError: boolean;
  canUndo: boolean;
  intervalLabel(rating: Rating): string;
  onLimit(limit: number): void;
  onReveal(): void;
  onReplay(): void;
  onRate(rating: Rating): void;
  onUndo(): void;
}

/**

 * Renders the selected deck's review session and keyboard shortcuts.

 */
export default function ReviewView(props: ReviewViewProps) {
  const handleLimit = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    props.onLimit(Number(input.value));
  };
  const handleKey = (event: KeyboardEvent): void => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      return;
    }
    if (event.key === " " && !props.revealed && props.card) {
      event.preventDefault();
      props.onReveal();
    } else if (event.key.toLowerCase() === "r") {
      props.onReplay();
    } else if (props.revealed && /^[1-4]$/.test(event.key)) {
      props.onRate(Number(event.key) as Rating);
    }
  };

  return (
    <div
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto"
      tabIndex={0}
      onKeyDown={handleKey}
    >
      <div class="flex flex-wrap items-center gap-3">
        <strong>{props.deckName}</strong>
        <span>
          {props.summary.due} due · {props.summary.fresh} new available
        </span>
        <label class="ml-auto">
          New per day{" "}
          <input
            class="w-20 rounded border bg-white p-1"
            type="number"
            min="0"
            max="9999"
            value={props.dailyLimit}
            onChange={handleLimit}
          />
        </label>
      </div>
      <Show
        when={props.card}
        fallback={
          <div>
            <p>
              No cards are available now.{" "}
              {props.summary.nextDue
                ? `Next review: ${new Date(props.summary.nextDue).toLocaleString()}.`
                : ""}
            </p>
            <Button disabled={!props.canUndo || props.saving} onClick={props.onUndo}>
              Undo last rating
            </Button>
          </div>
        }
      >
        <CardContent card={props.rendered} revealed={props.revealed} media={props.media} />
        <ReviewControls
          revealed={props.revealed}
          saving={props.saving}
          saveError={props.saveError}
          canUndo={props.canUndo}
          intervalLabel={props.intervalLabel}
          onReplay={props.onReplay}
          onReveal={props.onReveal}
          onRate={props.onRate}
          onUndo={props.onUndo}
        />
      </Show>
    </div>
  );
}
