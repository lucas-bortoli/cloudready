import TextInput from "../../../../../../../../../components/text-input/TextInput";

/** The response and controls for a written answer. */
export interface WrittenAnswerFormProps {
  response: string;
  revealed: boolean;
  onResponseChange: (response: string) => void;
}

/** Displays the response field for a self-graded exercise. */
export default function WrittenAnswerForm(props: WrittenAnswerFormProps) {
  return (
    <label class="mt-4 flex flex-col gap-2 font-medium">
      Your answer
      <TextInput
        multiLine
        value={props.response}
        onValueChange={props.onResponseChange}
        disabled={props.revealed}
      />
    </label>
  );
}
