import { Show } from "solid-js";
import Button from "../../../components/button/Button";

/**

 * Import status and actions shown at the top of Flashcards.

 */
export interface PackageToolbarProps {
  busy: boolean;
  error: string;
  onDeviceFile(file: File): void;
  onBrowse(): void;
  onCancel(): void;
}

/**

 * Presents package sources and the status of the current import.

 */
export default function PackageToolbar(props: PackageToolbarProps) {
  const handleFile = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // A cleared input fires change even when the same package is reopened.
    input.value = "";
    if (file) {
      props.onDeviceFile(file);
    }
  };

  return (
    <>
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="mr-auto text-xl font-semibold">Flashcards</h1>
        <label class="cursor-pointer rounded border border-neutral-400 bg-white px-3 py-2 outline-sky-300">
          Open from device
          <input class="sr-only" type="file" accept=".apkg" onChange={handleFile} />
        </label>
        <Button onClick={props.onBrowse}>Open CloudReady file</Button>
      </header>
      <Show when={props.busy}>
        <div role="status">
          Opening package… <Button onClick={props.onCancel}>Cancel</Button>
        </div>
      </Show>
      <Show when={props.error}>
        <p role="alert" class="text-red-700">
          {props.error}
        </p>
      </Show>
    </>
  );
}
