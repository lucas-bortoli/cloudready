import { createMemo, Match, Show, Switch } from "solid-js";
import Button from "../../../../../../../../components/button/Button";
import useDialog, {
  RejectReasonDialogCancelled,
  type DialogHandle,
} from "../../../../../../../../components/dialog/Dialog";
import { UserHtml } from "../../../../../../components/user-html/UserHtml";
import type { Exercise } from "../../../../../../core/learning-program";
import Answer from "./Answer";
import MultipleChoiceForm from "./forms/MultipleChoiceForm";
import WrittenAnswerForm from "./forms/WrittenAnswerForm";

/** The current exercise, subject, and session controls. */
export interface QuestionProps {
  exercise: Exercise;
  onSelect: (id: string) => void;
  index: number;
  count: number;
  response: string;
  revealed: boolean;
  note: string;
  onResponseChange: (response: string) => void;
  onNoteChange: (note: string) => void;
  onReveal: () => void;
  onRecord: (correct: boolean) => void;
  onSubmitChoice: () => void;
  onEnd: () => void;
}

/** Displays one question and its answer controls. */
export default function Question(props: QuestionProps) {
  const showDialog = useDialog();
  let endConfirmation: DialogHandle<"end" | "cancel"> | undefined;

  const handleEnd = async () => {
    if (endConfirmation?.exists()) {
      endConfirmation.emphasize();
      return;
    }

    const dialog = showDialog({
      icon: "question",
      title: "End attempt?",
      content: () => "End this attempt? Your progress will be saved as incomplete.",
      actions: { cancel: "Keep practicing", end: "End attempt" },
    });
    endConfirmation = dialog;
    try {
      if ((await dialog.result) === "end") props.onEnd();
    } catch (reason) {
      if (reason !== RejectReasonDialogCancelled) throw reason;
    } finally {
      if (endConfirmation === dialog) endConfirmation = undefined;
    }
  };

  const choices = createMemo(() => {
    const exercise = props.exercise;
    if (exercise.type === "multiple-choice") return exercise.choices;
    return undefined;
  });

  const isWrittenAnswer = createMemo(() => {
    const type = props.exercise.type;
    return type === "written-answer" || type === "fill-in-the-blank";
  });

  const cannotCheckAnswer = createMemo(() => {
    return props.exercise.type === "multiple-choice" && !props.response;
  });

  return (
    <div class="flex w-full max-w-md flex-col gap-2">
      <div class="text-lg leading-relaxed">
        <UserHtml title="Question" html={props.exercise.prompt} onSelect={props.onSelect} />
      </div>
      <Switch>
        <Match when={choices()}>
          {(choices) => (
            <MultipleChoiceForm
              choices={choices()}
              response={props.response}
              revealed={props.revealed}
              onResponseChange={props.onResponseChange}
              onSelect={props.onSelect}
            />
          )}
        </Match>
        <Match when={isWrittenAnswer()}>
          <WrittenAnswerForm
            response={props.response}
            revealed={props.revealed}
            onResponseChange={props.onResponseChange}
          />
        </Match>
      </Switch>
      <Show when={props.revealed}>
        <Answer
          exercise={props.exercise}
          onSelect={props.onSelect}
          response={props.response}
          note={props.note}
          onNoteChange={props.onNoteChange}
          onRecord={props.onRecord}
          onSubmitChoice={props.onSubmitChoice}
        />
      </Show>
      <Show when={!props.revealed}>
        <div class="mt-4 flex items-center justify-end gap-2">
          <Button variant="danger" onClick={handleEnd}>
            End attempt
          </Button>
          <Button variant="primary" disabled={cannotCheckAnswer()} onClick={props.onReveal}>
            Check answer
          </Button>
        </div>
      </Show>
    </div>
  );
}
