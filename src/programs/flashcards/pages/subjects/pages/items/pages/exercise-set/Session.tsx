import { Match, Show, Switch, untrack } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import type { OpenSubjectEntry } from "../../../../../../ui/createSubjectController";
import { createSessionController } from "./createSessionController";
import Overview from "./Overview";
import Question from "./Question";
import type { SetPageProps } from "./SetPage";

/** The routed set and its open subject draft. */
export interface SessionProps extends SetPageProps {
  entry: OpenSubjectEntry;
}

/** Composes the overview, question, and completion states of an attempt. */
export default function Session(props: SessionProps) {
  const session = untrack(() => createSessionController(props.entry, props.exerciseSet));
  return (
    <section
      x-role="exercise-set"
      class="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto p-4"
    >
      <h1 class="text-3xl">{props.exerciseSet.title}</h1>
      <p class="text-neutral-500">{props.exerciseSet.exercises.length} questions</p>
      <Switch>
        <Match when={!session.attemptId()}>
          <Overview
            count={props.exerciseSet.exercises.length}
            history={session.history()}
            onStart={session.start}
          />
        </Match>
        <Match when={session.finished()}>
          <div class="flex flex-col gap-3">
            <p role="status">
              Attempt complete:{" "}
              {session.currentAttempt()?.answers.filter((answer) => answer.correct).length} of{" "}
              {session.currentAttempt()?.answers.length} correct.
            </p>
            <Button class="self-end" onClick={session.end}>
              Back to exercise set
            </Button>
          </div>
        </Match>
        <Match when={session.attemptId() && !session.finished()}>
          <Show when={session.exercise()} keyed>
            {(exercise) => (
              <Question
                exercise={exercise}
                onSelect={props.onSelect}
                index={session.index()}
                count={props.exerciseSet.exercises.length}
                response={session.response()}
                revealed={session.revealed()}
                note={session.note()}
                onResponseChange={session.setResponse}
                onNoteChange={session.setNote}
                onReveal={session.reveal}
                onRecord={session.record}
                onSubmitChoice={session.submitChoice}
                onEnd={session.end}
              />
            )}
          </Show>
        </Match>
      </Switch>
    </section>
  );
}
