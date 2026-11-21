import CheckmarkFilled16 from "@carbon/icons/es/checkmark--filled/16.js";
import CloseFilled16 from "@carbon/icons/es/close--filled/16.js";
import { createMemo, Match, Show, Switch } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import CarbonIcon from "../../../../../../../../components/taskbar/CarbonIcon";
import TextInput from "../../../../../../../../components/text-input/TextInput";
import { UserHtml } from "../../../../../../components/user-html/UserHtml";
import type { Exercise } from "../../../../../../core/learning-program";

/** The revealed exercise and its grading controls. */
export interface AnswerProps {
  exercise: Exercise;
  onSelect: (id: string) => void;
  response: string;
  note: string;
  onNoteChange: (note: string) => void;
  onRecord: (correct: boolean) => void;
  onSubmitChoice: () => void;
}

/** Displays feedback and records the learner's assessment. */
export default function Answer(props: AnswerProps) {
  const isMultipleChoice = createMemo(() => props.exercise.type === "multiple-choice");
  const isSelfGraded = createMemo(() => {
    const type = props.exercise.type;
    return type === "written-answer" || type === "fill-in-the-blank";
  });

  const correctChoice = () => {
    const exercise = props.exercise;
    if (exercise.type === "multiple-choice")
      return exercise.choices.find((choice) => choice.id === exercise.correctChoiceId);
  };

  const isCorrect = () => {
    return (
      props.exercise.type === "multiple-choice" && props.response === props.exercise.correctChoiceId
    );
  };

  return (
    <div class="mt-4 flex flex-col gap-2 border-l-2 border-neutral-300 pt-2 pl-4">
      <Show when={isMultipleChoice()}>
        <Show when={isCorrect()}>
          <p class="inline-flex items-center gap-2 text-lg font-medium text-amber-800">
            <CarbonIcon icon={CloseFilled16} /> Not quite
          </p>
        </Show>
        <Show when={!isCorrect()}>
          <p class="inline-flex items-center gap-2 text-lg font-medium text-emerald-900">
            <CarbonIcon icon={CheckmarkFilled16} /> Correct!
          </p>
        </Show>
        <Show when={correctChoice()}>
          {(choice) => (
            <UserHtml title="Correct answer" html={choice().html} onSelect={props.onSelect} />
          )}
        </Show>
      </Show>
      <Show when={props.exercise.referenceAnswer}>
        {(answer) => (
          <UserHtml title="Reference answer" html={answer()} onSelect={props.onSelect} />
        )}
      </Show>
      <TextInput
        multiLine
        value={props.note}
        onValueChange={props.onNoteChange}
        class="field-sizing-content min-h-8!"
        placeholder="Add a note (optional)"
      />
      <div class="flex justify-end gap-2">
        <Switch>
          <Match when={isMultipleChoice()}>
            <Button variant="primary" onClick={props.onSubmitChoice}>
              Continue
            </Button>
          </Match>
          <Match when={isSelfGraded()}>
            <Button onClick={props.onRecord.bind(null, false)}>Incorrect</Button>
            <Button variant="primary" onClick={props.onRecord.bind(null, true)}>
              Correct
            </Button>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
