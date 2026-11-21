import { createMemo, For, Show } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import type { ExerciseAttempt } from "../../../../../../core/learning-program";

/** The set size, attempt history, and start action. */
export interface OverviewProps {
  count: number;
  history: ExerciseAttempt[];
  onStart: () => void;
}

/** Displays the start control and prior attempts for a set. */
export default function Overview(props: OverviewProps) {
  const recentAttempts = createMemo(() => [...props.history].reverse());

  return (
    <div class="flex w-full max-w-2xl flex-col gap-6">
      <section class="flex flex-col items-end gap-4 rounded-lg border border-sky-100 bg-sky-50 p-5">
        <div class="flex w-full flex-col gap-1">
          <h2 class="text-lg font-medium text-sky-950">Ready to practice?</h2>
          <Show
            when={props.count > 0}
            fallback={<p class="text-sky-900">This set has no questions yet.</p>}
          >
            <p class="text-sky-900">Work through the questions at your own pace.</p>
          </Show>
        </div>
        <Button variant="primary" disabled={!props.count} onClick={props.onStart}>
          Start attempt
        </Button>
      </section>

      <section class="flex flex-col gap-3">
        <div>
          <h2 class="text-lg font-medium">Previous attempts</h2>
          <p class="text-neutral-500">Your practice history for this set.</p>
        </div>
        <Show
          when={props.history.length > 0}
          fallback={
            <p class="rounded-lg border border-dashed border-neutral-300 p-5 text-neutral-500">
              No attempts yet. Start practicing to see your progress here.
            </p>
          }
        >
          <ul class="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <For each={recentAttempts()}>
              {(attempt) => (
                <li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <div class="flex flex-col gap-1">
                    <time class="font-medium" dateTime={new Date(attempt.startedAt).toISOString()}>
                      {new Date(attempt.startedAt).toLocaleString()}
                    </time>
                    <span class="text-neutral-500">
                      {attempt.answers.filter((answer) => answer.correct).length} of{" "}
                      {attempt.answers.length} answered correctly
                    </span>
                  </div>
                  <Show
                    when={attempt.finishedAt}
                    fallback={
                      <span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                        Incomplete
                      </span>
                    }
                  >
                    <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      Complete
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
