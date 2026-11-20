import { For, Show } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import { SubjectHtmlView } from "../../../../../../components/subjects/SubjectHtmlView";
import type { Exercise } from "../../../../../../core/learning-program";
import type { OpenSubjectPackage } from "../../../../../../core/subject-package/types";
import type { createExerciseSessionController } from "./createExerciseSessionController";
import ExerciseAnswer from "./ExerciseAnswer";

type Session = ReturnType<typeof createExerciseSessionController>;

/** The current exercise, subject, and session controls. */
export interface ExerciseQuestionProps {
  exercise: Exercise;
  subject: OpenSubjectPackage;
  onSelect: (id: string) => void;
  index: number;
  count: number;
  session: Session;
}

/** Displays one question and its answer controls. */
export default function ExerciseQuestion(props: ExerciseQuestionProps) {
  const handleResponse = (event: Event & { currentTarget: HTMLTextAreaElement }) =>
    props.session.setResponse(event.currentTarget.value);
  const selectChoice = (id: string) => props.session.setResponse(id);
  return (
    <>
      <p>
        Question {props.index + 1} of {props.count}
      </p>
      <div class="min-h-32">
        <SubjectHtmlView
          subject={props.subject}
          title="Question"
          html={props.exercise.prompt}
          onSelect={props.onSelect}
        />
      </div>
      <Show
        when={props.exercise.type === "multiple-choice" && props.exercise.choices}
        fallback={
          <label class="flex flex-col gap-1">
            Your answer
            <textarea
              class="min-h-24 rounded border p-2 outline-sky-300 focus:outline-2 focus:outline-offset-2"
              value={props.session.response()}
              onInput={handleResponse}
              disabled={props.session.revealed()}
            />
          </label>
        }
      >
        {(choices) => (
          <fieldset class="flex flex-col gap-2">
            <legend>Choose an answer</legend>
            <For each={choices()}>
              {(choice, index) => (
                <div class="flex items-start gap-2">
                  <input
                    class="mt-2 outline-sky-300 focus:outline-2 focus:outline-offset-2"
                    type="radio"
                    name="exercise-choice"
                    aria-label={`Choice ${index() + 1}`}
                    checked={props.session.response() === choice.id}
                    disabled={props.session.revealed()}
                    onChange={selectChoice.bind(null, choice.id)}
                  />
                  <div class="h-24 min-w-0 flex-1">
                    <SubjectHtmlView
                      subject={props.subject}
                      title="Choice"
                      html={choice.html}
                      onSelect={props.onSelect}
                    />
                  </div>
                </div>
              )}
            </For>
          </fieldset>
        )}
      </Show>
      <Show
        when={props.session.revealed()}
        fallback={
          <Button
            class="min-h-10 self-start"
            variant="primary"
            disabled={props.exercise.type === "multiple-choice" && !props.session.response()}
            onClick={props.session.reveal}
          >
            Check answer
          </Button>
        }
      >
        <ExerciseAnswer
          exercise={props.exercise}
          subject={props.subject}
          onSelect={props.onSelect}
          session={props.session}
        />
      </Show>
      <Button class="min-h-10 self-start" variant="ghost" onClick={props.session.end}>
        End attempt
      </Button>
    </>
  );
}
