import { createSignal, For, onMount } from "solid-js";
import Button from "../../../components/button/Button";
import TextInput from "../../../components/text-input/TextInput";
import focusTrap from "../../../lib/focus-trap";
import type { Tag, TagId } from "../model/model";

export interface TagEditorProps {
  tags: readonly Tag[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: TagId, name: string) => void;
  onDelete: (id: TagId) => void;
}

/** Manages the tags available in the selected project. */
export default function TagEditor(props: TagEditorProps) {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal("");
  let nameInput: HTMLTextAreaElement | undefined;

  const createTag = (event: SubmitEvent) => {
    event.preventDefault();
    try {
      props.onCreate(name());
      setName("");
      setError("");
      nameInput?.focus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create tag.");
    }
  };

  const renameTag = (tag: Tag) => {
    const nextName = window.prompt("Rename tag", tag.name);
    if (nextName === null) return;
    try {
      props.onRename(tag.id, nextName);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not rename tag.");
    }
  };

  const deleteTag = (tag: Tag) => {
    if (window.confirm(`Delete tag "${tag.name}" from this project?`)) props.onDelete(tag.id);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose();
  };
  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) props.onClose();
  };
  onMount(() => nameInput?.focus());

  return (
    <div
      x-role="kodekai tag editor backdrop"
      class="absolute inset-0 z-30 flex items-center justify-center bg-neutral-900/35 p-4"
      onClick={handleBackdropClick}
    >
      <section
        x-role="kodekai tag editor"
        role="dialog"
        aria-modal="true"
        aria-label="Manage tags"
        class="w-full max-w-md rounded border border-neutral-400 bg-white p-5 shadow-xl"
        use:focusTrap={focusTrap}
        onKeyDown={handleKeyDown}
      >
        <h2 class="mb-4 text-lg font-semibold">Manage tags</h2>
        <form class="flex gap-2" onSubmit={createTag}>
          <TextInput
            ref={nameInput}
            value={name()}
            onValueChange={setName}
            placeholder="Tag name"
          />
          <Button type="submit" variant="primary">
            Add
          </Button>
        </form>
        {error() && (
          <p role="alert" class="mt-2 text-red-700">
            {error()}
          </p>
        )}
        <ul class="my-4 max-h-64 overflow-auto">
          <For each={props.tags}>
            {(tag) => (
              <li class="flex items-center gap-2 border-b border-neutral-100 py-1">
                <span class="grow">{tag.name}</span>
                <Button onClick={renameTag.bind(null, tag)}>Rename</Button>
                <Button onClick={deleteTag.bind(null, tag)} variant="danger">
                  Delete
                </Button>
              </li>
            )}
          </For>
        </ul>
        <div class="flex justify-end">
          <Button onClick={props.onClose}>Done</Button>
        </div>
      </section>
    </div>
  );
}
