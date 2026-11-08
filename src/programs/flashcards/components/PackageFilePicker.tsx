import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Button from "../../../components/button/Button";
import { filesystem, type FileSystemEntry } from "../../../filesystem/FileSystemClient";

/**

 * Callbacks for the profile filesystem package picker.

 */
export interface PackageFilePickerProps {
  onSelect(path: string, name: string): void;
  onClose(): void;
}

/**

 * Browses the active profile's filesystem and returns a selected package path.

 */
export default function PackageFilePicker(props: PackageFilePickerProps) {
  const [path, setPath] = createSignal("/");
  const [entries, setEntries] = createSignal<readonly FileSystemEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  let request = 0;
  onCleanup(() => {
    // Ignore directory responses after the picker is closed.
    request += 1;
  });

  const browse = async (next: string): Promise<void> => {
    const current = ++request;
    setLoading(true);
    setError("");
    try {
      const items = await filesystem.list(next);
      // A slower earlier directory request must not replace the current listing.
      if (current === request) {
        setEntries(items);
        setPath(next);
      }
    } catch (cause) {
      if (current === request) {
        setError(cause instanceof Error ? cause.message : "Could not browse files.");
      }
    } finally {
      if (current === request) {
        setLoading(false);
      }
    }
  };
  onMount(() => {
    void browse("/");
  });

  const handleParent = (): void => {
    const parent = path().replace(/\/?[^/]+\/?$/, "") || "/";
    void browse(parent);
  };
  const handleEntry = (entry: FileSystemEntry): void => {
    if (entry.kind === "directory") {
      void browse(entry.path);
    } else if (entry.name.toLowerCase().endsWith(".apkg")) {
      props.onSelect(entry.path, entry.name);
    }
  };

  return (
    <section class="rounded border bg-white p-3">
      <div class="flex gap-2">
        <Button onClick={handleParent}>Up</Button>
        <span>{path()}</span>
        <Button onClick={props.onClose}>Close</Button>
      </div>
      <Show when={loading()}>
        <p role="status">Loading files…</p>
      </Show>
      <Show when={error()}>
        <p role="alert" class="text-red-700">
          {error()}
        </p>
      </Show>
      <ul>
        <For each={entries()}>
          {(entry) => (
            <li>
              <button
                class="block w-full p-2 text-left outline-sky-300 focus:outline-2 focus:outline-offset-2"
                onClick={handleEntry.bind(null, entry)}
              >
                {entry.kind === "directory" ? "📁 " : "📄 "}
                {entry.name}
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
