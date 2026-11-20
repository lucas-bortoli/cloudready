import { Show, untrack } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import type { OpenSubjectEntry } from "../../../../../../ui/createSubjectController";
import type { ExerciseSetPageProps } from "./ExerciseSetPage";
import { createExerciseSessionController } from "./createExerciseSessionController";
import ExerciseOverview from "./ExerciseOverview";
import ExerciseQuestion from "./ExerciseQuestion";

/** The routed set and its open subject draft. */
export interface ExerciseSessionProps extends ExerciseSetPageProps {
  entry: OpenSubjectEntry;
}

/** Composes the overview, question, and completion states of an attempt. */
export default function ExerciseSession(props: ExerciseSessionProps) {
  const session = untrack(() => createExerciseSessionController(props.entry, props.exerciseSet));
  return (
    <section
      x-role="exercise-set"
      class="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto p-4"
    >
      <h1 class="text-2xl">{props.exerciseSet.title}</h1>
      <p>{props.exerciseSet.exercises.length} questions</p>
      <Show
        when={session.attemptId()}
        fallback={
          <ExerciseOverview
            count={props.exerciseSet.exercises.length}
            history={session.history()}
            onStart={session.start}
          />
        }
      >
        <Show
          when={!session.finished()}
          fallback={
            <>
              <p role="status">
                Attempt complete:{" "}
                {session.currentAttempt()?.answers.filter((answer) => answer.correct).length} of{" "}
                {session.currentAttempt()?.answers.length} correct.
              </p>
              <Button class="min-h-10 self-start" onClick={session.end}>
                Back to exercise set
              </Button>
            </>
          }
        >
          <Show when={session.exercise()} keyed>
            {(exercise) => (
              <ExerciseQuestion
                exercise={exercise}
                subject={props.entry.subject}
                onSelect={props.onSelect}
                index={session.index()}
                count={props.exerciseSet.exercises.length}
                session={session}
              />
            )}
          </Show>
        </Show>
      </Show>
    </section>
  );
}
