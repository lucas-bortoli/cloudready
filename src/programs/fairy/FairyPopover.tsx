import { createSignal, For, Show } from "solid-js";
import { useFairy } from "./FairyContext";

interface FairyPopoverProps {
  onClose: () => void;
  onConnect: () => void;
}

/** Renders the user-facing Navi conversation over the kernel-owned Fairy state. */
export default function FairyPopover(props: FairyPopoverProps) {
  const fairy = useFairy();
  const [draft, setDraft] = createSignal("");
  const send = async () => {
    const text = draft().trim();
    if (!text || fairy.state().phase !== "awaiting-input") return;
    await fairy.submit(text);
    setDraft("");
  };
  const handleInput = (event: InputEvent) =>
    setDraft((event.currentTarget as HTMLTextAreaElement).value);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };
  const handleSend = () => void send();
  return (
    <section
      id="fairy-conversation"
      x-role="fairy conversation"
      class="absolute top-13 right-36 z-20 flex h-110 w-96 flex-col rounded border border-neutral-300 bg-white p-3 text-neutral-800 shadow-xl"
      onKeyDown={handleKeyDown}
    >
      <header class="flex items-center justify-between border-b border-neutral-200 pb-2">
        <h2 class="font-semibold">Navi</h2>
        <button
          class="outline-sky-200 focus:outline-2 focus:outline-offset-2"
          type="button"
          onClick={props.onClose}
        >
          Close
        </button>
      </header>
      <Show
        when={fairy.state().connected}
        fallback={
          <div class="grow py-4 text-sm">
            <p>Navi needs ChatGPT to help.</p>
            <button
              class="mt-3 rounded bg-neutral-800 px-3 py-2 text-white outline-sky-200 focus:outline-2 focus:outline-offset-2"
              type="button"
              onClick={props.onConnect}
            >
              Open Machine Intelligence
            </button>
          </div>
        }
      >
        <div class="grow overflow-y-auto py-3">
          <For each={fairy.state().messages}>
            {(message) => (
              <article class="mb-2">
                <strong>{message.role === "assistant" ? "Navi" : "You"}</strong>
                <p>{message.text}</p>
                <Show when={message.role === "user" && message.status === "failed"}>
                  <button
                    class="outline-sky-200 focus:outline-2 focus:outline-offset-2"
                    type="button"
                    onClick={fairy.retry.bind(null, message.id)}
                  >
                    Retry
                  </button>
                </Show>
              </article>
            )}
          </For>
          <Show when={fairy.state().activity}>
            <p role="status" class="text-sm text-neutral-500">
              {fairy.state().activity}
            </p>
          </Show>
        </div>
        <Show when={fairy.state().queued}>
          <p class="text-sm text-neutral-500">One message is queued.</p>
        </Show>
        <textarea
          class="resize-none rounded border border-neutral-300 p-2 outline-sky-200 focus:outline-2 focus:outline-offset-2"
          rows={2}
          value={draft()}
          onInput={handleInput}
          placeholder="Ask Navi..."
        />
        <button
          class="mt-2 rounded bg-neutral-800 px-3 py-2 text-white outline-sky-200 focus:outline-2 focus:outline-offset-2 disabled:opacity-50"
          type="button"
          disabled={!draft().trim() || fairy.state().phase !== "awaiting-input"}
          onClick={handleSend}
        >
          Send
        </button>
      </Show>
    </section>
  );
}
