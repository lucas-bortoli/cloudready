import { For } from "solid-js";
import Radio from "../../../../../../../../../components/radio/Radio";
import RadioGroup from "../../../../../../../../../components/radio/RadioGroup";
import { UserHtml } from "../../../../../../../components/user-html/UserHtml";
import type { ExerciseChoice } from "../../../../../../../core/learning-program";

/** The choices and controls for a multiple-choice answer. */
export interface MultipleChoiceFormProps {
  choices: ExerciseChoice[];
  response: string;
  revealed: boolean;
  onResponseChange: (response: string) => void;
  onSelect: (id: string) => void;
}

/** Displays the available choices for an exercise. */
export default function MultipleChoiceForm(props: MultipleChoiceFormProps) {
  const handleChoiceKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (event.key !== "Tab" || props.revealed) return;
    const fieldset = event.currentTarget.closest("fieldset");
    if (!fieldset) return;
    const choices = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const index = choices.indexOf(event.currentTarget);
    const next = choices[index + (event.shiftKey ? -1 : 1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <fieldset class="mt-4 flex flex-col gap-2">
      <RadioGroup
        name="exercise-choice"
        value={props.response}
        onValueChange={props.onResponseChange}
      >
        <For each={props.choices}>
          {(choice) => (
            <Radio value={choice.id} disabled={props.revealed} onKeyDown={handleChoiceKeyDown}>
              <UserHtml title="Choice" html={choice.html} onSelect={props.onSelect} />
            </Radio>
          )}
        </For>
      </RadioGroup>
    </fieldset>
  );
}
