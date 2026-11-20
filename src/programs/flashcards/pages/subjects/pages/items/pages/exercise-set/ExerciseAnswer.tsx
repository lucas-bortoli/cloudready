import { Show } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import { SubjectHtmlView } from "../../../../../../components/subjects/SubjectHtmlView";
import type { Exercise } from "../../../../../../core/learning-program";
import type { OpenSubjectPackage } from "../../../../../../core/subject-package/types";
import type { createExerciseSessionController } from "./createExerciseSessionController";

/** The revealed exercise and its grading controls. */
export interface ExerciseAnswerProps {
  exercise: Exercise;
  subject: OpenSubjectPackage;
  onSelect: (id: string) => void;
  session: ReturnType<typeof createExerciseSessionController>;
}

/** Displays feedback and records the learner's assessment. */
export default function ExerciseAnswer(props: ExerciseAnswerProps) {
  const handleNote = (event: Event & { currentTarget: HTMLTextAreaElement }) =>
    props.session.setNote(event.currentTarget.value);
  const correctChoice = () => {
    const exercise = props.exercise;
    if (exercise.type === "multiple-choice")
      return exercise.choices.find((choice) => choice.id === exercise.correctChoiceId);
  };
  const isCorrect = () =>
    props.exercise.type === "multiple-choice" &&
    props.session.response() === props.exercise.correctChoiceId;
  return (
    <>
      <Show when={props.exercise.type === "multiple-choice"}>
        <p role="status">
          <Show when={isCorrect()} fallback="Incorrect.">
            Correct!
          </Show>
        </p>
        <Show when={correctChoice()}>
          {(choice) => (
            <div class="h-24">
              <p>Correct answer:</p>
              <SubjectHtmlView
                subject={props.subject}
                title="Correct answer"
                html={choice().html}
                onSelect={props.onSelect}
              />
            </div>
          )}
        </Show>
      </Show>
      <Show when={props.exercise.referenceAnswer}>
        {(answer) => (
          <>
            <p>Reference answer:</p>
            <div class="min-h-32">
              <SubjectHtmlView
                subject={props.subject}
                title="Reference answer"
                html={answer()}
                onSelect={props.onSelect}
              />
            </div>
          </>
        )}
      </Show>
      <label class="flex flex-col gap-1">
        Note (optional)
        <textarea
          class="min-h-16 rounded border p-2 outline-sky-300 focus:outline-2 focus:outline-offset-2"
          value={props.session.note()}
          onInput={handleNote}
        />
      </label>
      <Show
        when={props.exercise.type === "multiple-choice"}
        fallback={
          <div class="flex flex-wrap gap-2">
            <Button class="min-h-10" onClick={props.session.record.bind(null, false)}>
              Incorrect
            </Button>
            <Button
              class="min-h-10"
              variant="primary"
              onClick={props.session.record.bind(null, true)}
            >
              Correct
            </Button>
          </div>
        }
      >
        <Button class="min-h-10 self-start" variant="primary" onClick={props.session.submitChoice}>
          Continue
        </Button>
      </Show>
    </>
  );
}
