import { Show } from "solid-js";
import Checkbox from "../../checkbox/Checkbox";

export type LegalConsentProps = {
  accepted: boolean;
  document: string | undefined;
  error: unknown;
  name: string;
  onAcceptedChange: (accepted: boolean) => void;
};

export default function LegalConsent(props: LegalConsentProps) {
  return (
    <div class="flex min-h-0 w-full flex-1 flex-col text-left">
      <Show
        when={props.document}
        fallback={
          <p class="text-neutral-600">
            {props.error instanceof Error ? props.error.message : `Loading the ${props.name}...`}
          </p>
        }
      >
        {(document) => (
          <pre class="min-h-0 flex-1 overflow-y-auto rounded-xs border border-neutral-300 bg-neutral-50 p-4 font-sans text-sm whitespace-pre-wrap text-neutral-700">
            {document()}
          </pre>
        )}
      </Show>
      <Checkbox
        x-role={`${props.name} consent`}
        checked={props.accepted}
        class="mt-4"
        onCheckedChange={props.onAcceptedChange}
      >
        I have read and accept the {props.name}.
      </Checkbox>
    </div>
  );
}
