import { For, Show } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import type { ExerciseAttempt } from "../../../../../../core/learning-program";

/** The set size, attempt history, and start action. */
export interface ExerciseOverviewProps {
  count: number;
  history: ExerciseAttempt[];
  onStart: () => void;
}

/** Displays the start control and prior attempts for a set. */
export default function ExerciseOverview(props: ExerciseOverviewProps) {
  return (
    <>
      <Button
        class="min-h-10 self-start"
        variant="primary"
        disabled={!props.count}
        onClick={props.onStart}
      >
        Start attempt
      </Button>
      <Show when={props.history.length}>
        <h2 class="text-xl">Previous attempts</h2>
        <ul>
          <For each={[...props.history].reverse()}>
            {(attempt) => (
              <li>
                {new Date(attempt.startedAt).toLocaleString()} ·{" "}
                {attempt.answers.filter((answer) => answer.correct).length}/{attempt.answers.length}{" "}
                correct <Show when={!attempt.finishedAt}>· Incomplete</Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  );
}
