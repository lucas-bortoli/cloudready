import { createSignal, For, onMount, Show } from "solid-js";
import {
  useClient,
  type MachineIntelligenceConnection,
  type MachineIntelligenceModel,
} from "./MachineIntelligenceContext";

/** A small manual test surface for the system's ChatGPT connection. */
export default function MachineIntelligenceWindow() {
  const client = useClient();
  const [connection, setConnection] = createSignal<MachineIntelligenceConnection>();
  const [models, setModels] = createSignal<readonly MachineIntelligenceModel[]>([]);
  const [selectedModel, setSelectedModel] = createSignal("");
  const [prompt, setPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const load = async () => {
    const status = await client.connection();
    setConnection(status);
    if (status.connected) {
      const available = await client.models();
      setModels(available);
      setSelectedModel((current) =>
        available.some((model) => model.slug === current) ? current : (available[0]?.slug ?? ""),
      );
    } else {
      setModels([]);
      setSelectedModel("");
    }
  };

  onMount(() => {
    void load().catch((cause: unknown) => setError(message(cause)));
  });

  const handleConnect = async () => {
    setError("");
    setBusy(true);
    try {
      // connect() opens the popup synchronously before its first await.
      await client.connect();
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await client.disconnect();
      await load();
      if (!result.revoked)
        setError("Disconnected locally. Remote revocation could not be confirmed.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    setError("");
    setResponse("");
    setBusy(true);
    try {
      setResponse(await client.generateText(selectedModel(), prompt()));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const handlePromptInput = (event: InputEvent) =>
    setPrompt((event.currentTarget as HTMLTextAreaElement).value);
  const handleModelChange = (event: Event) =>
    setSelectedModel((event.currentTarget as HTMLSelectElement).value);

  return (
    <section
      x-role="machine intelligence"
      class="flex h-full flex-col gap-4 overflow-auto bg-white p-5 text-neutral-700"
    >
      <header>
        <h1 class="text-xl font-semibold">Machine Intelligence</h1>
        <p class="text-sm text-neutral-500">Connect ChatGPT to try a text prompt.</p>
      </header>
      <div class="flex items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <p>
          {connection()?.connected
            ? `Connected: ${connection()?.email ?? "ChatGPT account"}`
            : "Not connected"}
        </p>
        <Show
          when={connection()?.connected}
          fallback={
            <button
              type="button"
              disabled={busy()}
              onClick={handleConnect}
              class="rounded bg-neutral-800 px-3 py-2 text-white outline-sky-200 focus:outline-2 focus:outline-offset-2 disabled:opacity-50"
            >
              Continue with ChatGPT
            </button>
          }
        >
          <button
            type="button"
            disabled={busy()}
            onClick={handleDisconnect}
            class="rounded border border-neutral-300 px-3 py-2 outline-sky-200 focus:outline-2 focus:outline-offset-2 disabled:opacity-50"
          >
            Disconnect
          </button>
        </Show>
      </div>
      <Show when={connection()?.connected}>
        <label class="flex flex-col gap-1 text-sm">
          Model
          <select
            value={selectedModel()}
            onChange={handleModelChange}
            class="rounded border border-neutral-300 p-2 outline-sky-200 focus:outline-2 focus:outline-offset-2"
          >
            <For each={models()}>
              {(model) => <option value={model.slug}>{model.displayName}</option>}
            </For>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Prompt
          <textarea
            value={prompt()}
            onInput={handlePromptInput}
            rows={4}
            class="resize-y rounded border border-neutral-300 p-2 outline-sky-200 focus:outline-2 focus:outline-offset-2"
          />
        </label>
        <button
          type="button"
          disabled={busy() || !selectedModel() || !prompt().trim()}
          onClick={handleGenerate}
          class="self-start rounded bg-neutral-800 px-3 py-2 text-white outline-sky-200 focus:outline-2 focus:outline-offset-2 disabled:opacity-50"
        >
          {busy() ? "Working…" : "Send prompt"}
        </button>
      </Show>
      <Show when={error()}>
        <p role="alert" class="text-red-700">
          {error()}
        </p>
      </Show>
      <Show when={response()}>
        <div class="rounded bg-neutral-100 p-3 whitespace-pre-wrap">{response()}</div>
      </Show>
    </section>
  );
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong.";
}
