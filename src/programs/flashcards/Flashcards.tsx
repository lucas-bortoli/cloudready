import { batch, createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { filesystem, type FileSystemEntry } from "../../filesystem/FileSystemClient";
import Button from "../../components/button/Button";
import type { AnkiCard } from "./core/anki";
import { newCard, schedule, type Rating } from "./core/fsrs";
import { reviewQueue } from "./core/progress";
import { renderCard } from "./core/template";
import { cardDocument } from "./browser/card-document";
import { openPackage, releasePackage, type LoadedPackage } from "./browser/session";

/** Opens Anki packages and studies their supported cards in the active profile. */
export default function Flashcards(props: { userId: string }) {
  const [loaded, setLoaded] = createSignal<LoadedPackage>();
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal(""),
    [path, setPath] = createSignal("/");
  const [entries, setEntries] = createSignal<readonly FileSystemEntry[]>([]),
    [browsing, setBrowsing] = createSignal(false);
  const [deck, setDeck] = createSignal(""),
    [revealed, setRevealed] = createSignal(false),
    [revision, setRevision] = createSignal(0),
    [now, setNow] = createSignal(Date.now());
  let abort: AbortController | undefined;
  let unsubscribe: (() => void) | undefined;
  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let playback = 0;
  const timer = window.setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => {
    window.clearInterval(timer);
    abort?.abort();
    unsubscribe?.();
    const current = loaded();
    if (current) releasePackage(props.userId, current.hash);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    playback++;
    audio?.pause();
  });
  const handleCancel = () => {
    abort?.abort();
    setBusy(false);
  };
  const load = async (name: string, read: () => Promise<ArrayBuffer>) => {
    setBusy(true);
    setError("");
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    try {
      const bytes = await read();
      if (controller.signal.aborted) return;
      const result = await openPackage(props.userId, name, bytes, controller.signal);
      if (controller.signal.aborted) {
        releasePackage(props.userId, result.hash);
        return;
      }
      const old = loaded();
      if (old) releasePackage(props.userId, old.hash);
      unsubscribe?.();
      unsubscribe = result.store.subscribe(() => setRevision((v) => v + 1));
      setLoaded(result);
      setDeck("");
      setRevealed(false);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not open the deck.");
    } finally {
      if (abort === controller) setBusy(false);
    }
  };
  const handleFile = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Clearing the selection allows reopening the same package in this window.
    input.value = "";
    if (file) void load(file.name, () => file.arrayBuffer());
  };
  const browse = async (next: string) => {
    try {
      setEntries(await filesystem.list(next));
      setPath(next);
      setBrowsing(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not browse files.");
    }
  };
  const handleBrowse = () => void browse("/");
  const handleCloseBrowser = () => setBrowsing(false);
  const handleParent = () => void browse(path().replace(/\/?[^/]+\/?$/, "") || "/");
  const handleEntry = (entry: FileSystemEntry) => {
    if (entry.kind === "directory") void browse(entry.path);
    else if (entry.name.toLowerCase().endsWith(".apkg")) {
      setBrowsing(false);
      void load(entry.name, async () => (await filesystem.readFile(entry.path)).arrayBuffer());
    }
  };
  const collection = () => loaded()?.collection;
  const noteMap = createMemo(() => new Map(collection()?.notes.map((n) => [n.id, n]) ?? []));
  const typeMap = createMemo(() => new Map(collection()?.types.map((t) => [t.id, t]) ?? []));
  const deckMap = createMemo(() => new Map(collection()?.decks.map((d) => [d.id, d]) ?? []));
  const compatible = createMemo(() => {
    const result: AnkiCard[] = [];
    let unsupported = 0;
    for (const card of collection()?.cards ?? []) {
      const note = noteMap().get(card.noteId),
        type = note && typeMap().get(note.typeId);
      try {
        if (!note || !type) throw new Error("Missing note type");
        renderCard(card, note, type, deckMap().get(card.deckId)?.name ?? "");
        result.push(card);
      } catch {
        unsupported++;
      }
    }
    return { cards: result, unsupported };
  });
  const queue = createMemo(() => {
    revision();
    const current = loaded();
    return current && deck()
      ? reviewQueue(compatible().cards, current.store.progress, deck(), now())
      : [];
  });
  // The queue is refreshed each second, but the frame must not reload while the same card is shown.
  const summary = createMemo(() => {
    revision();
    const store = loaded()?.store;
    if (!store || !deck()) return { due: 0, fresh: 0, nextDue: undefined as number | undefined };
    const due = queue().filter((card) => !!store.progress.cards[card.id]).length;
    const fresh = queue().length - due;
    const future = compatible()
      .cards.filter((card) => card.deckId === deck() && store.progress.cards[card.id]?.due > now())
      .map((card) => store.progress.cards[card.id].due);
    return { due, fresh, nextDue: future.length ? Math.min(...future) : undefined };
  });
  // Newly due cards should join the queue without interrupting a card being studied.
  const selection = createMemo<{
    package: LoadedPackage | undefined;
    deckId: string;
    card: AnkiCard | undefined;
  }>((previous) => {
    const currentPackage = loaded();
    const deckId = deck();
    const cards = queue();
    const current =
      previous && previous.package === currentPackage && previous.deckId === deckId
        ? cards.find((card) => card.id === previous.card?.id)
        : undefined;
    return { package: currentPackage, deckId, card: current ?? cards[0] };
  });
  const currentCard = createMemo(() => selection().card);
  const rendered = createMemo(() => {
    const card = currentCard();
    if (!card) return undefined;
    const note = noteMap().get(card.noteId),
      type = note && typeMap().get(note.typeId);
    return note && type
      ? renderCard(card, note, type, deckMap().get(card.deckId)?.name ?? "")
      : undefined;
  });
  const play = (names: string[]) => {
    const generation = ++playback;
    audio?.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = undefined;
    const playNext = (index: number) => {
      if (generation !== playback || index >= names.length) return;
      const bytes = collection()?.media[names[index]];
      if (!bytes) {
        playNext(index + 1);
        return;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(new Blob([bytes.slice().buffer]));
      audio = new Audio(audioUrl);
      audio.onended = () => playNext(index + 1);
      void audio.play().catch(() => undefined);
    };
    playNext(0);
  };
  const document = createMemo(() => {
    const card = rendered();
    return card && collection()
      ? cardDocument(revealed() ? card.back : card.front, card.css, collection()!.media)
      : undefined;
  });
  createEffect(() => {
    const current = document();
    onCleanup(() => current?.urls.forEach((url) => URL.revokeObjectURL(url)));
  });
  let playedCard = "";
  createEffect(() => {
    const card = currentCard();
    const id = card ? `${deck()}:${card.id}` : "";
    if (id !== playedCard) {
      playedCard = id;
      setRevealed(false);
      if (card) play(rendered()?.frontAudio ?? []);
    }
  });
  const intervalLabel = (rating: Rating): string => {
    const item = currentCard(),
      store = loaded()?.store;
    if (!item || !store) return "";
    const timestamp = now();
    const next =
      schedule(store.progress.cards[item.id] ?? newCard(), rating, timestamp).card.due - timestamp;
    return next < 3600000
      ? `${Math.round(next / 60000)}m`
      : next < 86400000
        ? `${Math.round(next / 3600000)}h`
        : `${Math.round(next / 86400000)}d`;
  };
  const handleReveal = () => {
    setRevealed(true);
    play(rendered()?.backAudio ?? []);
  };
  const handleReplay = () =>
    play(revealed() ? (rendered()?.backAudio ?? []) : (rendered()?.frontAudio ?? []));
  const handleRate = (rating: Rating) => {
    const card = currentCard(),
      store = loaded()?.store;
    if (card && store && !store.busy && !store.error) {
      // Updating the answer and queue together avoids flashing the previous front.
      batch(() => {
        setRevealed(false);
        void store.rate(card, rating);
      });
    }
  };
  const handleUndo = () => {
    setRevealed(false);
    void loaded()?.store.undo();
  };
  const handleDeck = (id: string) => {
    setDeck(id);
    setRevealed(false);
  };
  const handleBack = () => {
    setDeck("");
    setRevealed(false);
    play([]);
  };
  const handleRetry = () => void loaded()?.store.save();
  const handleLimit = (event: Event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    void loaded()?.store.setLimit(deck(), value);
  };
  const handleKey = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    if (event.key === " " && !revealed() && currentCard()) {
      event.preventDefault();
      handleReveal();
    } else if (event.key.toLowerCase() === "r") handleReplay();
    else if (revealed() && /^[1-4]$/.test(event.key)) handleRate(Number(event.key) as Rating);
  };
  return (
    <div
      x-role="flashcards"
      class="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-neutral-50 p-4 text-neutral-800"
      tabIndex={0}
      onKeyDown={handleKey}
    >
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="mr-auto text-xl font-semibold">Flashcards</h1>
        <label class="cursor-pointer rounded border border-neutral-400 bg-white px-3 py-2 outline-sky-300">
          Open from device
          <input class="sr-only" type="file" accept=".apkg" onChange={handleFile} />
        </label>
        <Button onClick={handleBrowse}>Open CloudReady file</Button>
      </header>
      <Show when={busy()}>
        <div role="status">
          Opening package… <Button onClick={handleCancel}>Cancel</Button>
        </div>
      </Show>
      <Show when={error()}>
        <p role="alert" class="text-red-700">
          {error()}
        </p>
      </Show>
      <Show when={browsing()}>
        <section class="rounded border bg-white p-3">
          <div class="flex gap-2">
            <Button onClick={handleParent}>Up</Button>
            <span>{path()}</span>
            <Button onClick={handleCloseBrowser}>Close</Button>
          </div>
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
      </Show>
      <Show
        when={loaded()}
        fallback={
          <p>
            Open an Anki package to start studying. Your review progress is saved to your CloudReady
            profile.
          </p>
        }
      >
        <Show when={loaded()?.store.error}>
          <div role="alert" class="rounded bg-red-100 p-2">
            Could not save progress. <Button onClick={handleRetry}>Retry</Button>
          </div>
        </Show>
        <Show
          when={!deck()}
          fallback={
            <>
              <div class="flex flex-wrap items-center gap-3">
                <Button onClick={handleBack}>Decks</Button>
                <strong>{deckMap().get(deck())?.name}</strong>
                <span>
                  {summary().due} due · {summary().fresh} new available
                </span>
                <label class="ml-auto">
                  New per day{" "}
                  <input
                    class="w-20 rounded border bg-white p-1"
                    type="number"
                    min="0"
                    max="9999"
                    value={loaded()?.store.progress.dailyLimit[deck()] ?? 20}
                    onChange={handleLimit}
                  />
                </label>
              </div>
              <Show
                when={currentCard()}
                fallback={
                  <div>
                    <p>
                      No cards are available now.{" "}
                      {summary().nextDue
                        ? `Next review: ${new Date(summary().nextDue!).toLocaleString()}.`
                        : ""}
                    </p>
                    <Button
                      disabled={!loaded()?.store.canUndo() || loaded()?.store.busy}
                      onClick={handleUndo}
                    >
                      Undo last rating
                    </Button>
                  </div>
                }
              >
                <iframe
                  title="Flashcard"
                  sandbox=""
                  class="min-h-48 w-full flex-1 rounded border bg-white"
                  srcdoc={document()?.srcdoc}
                />
                <div class="flex flex-wrap justify-center gap-2">
                  <Button onClick={handleReplay}>Replay audio</Button>
                  <Show
                    when={revealed()}
                    fallback={
                      <Button variant="primary" onClick={handleReveal}>
                        Show answer
                      </Button>
                    }
                  >
                    <For each={[1, 2, 3, 4] as Rating[]}>
                      {(rating) => (
                        <Button
                          disabled={loaded()?.store.busy || !!loaded()?.store.error}
                          onClick={handleRate.bind(null, rating)}
                        >
                          {["Again", "Hard", "Good", "Easy"][rating - 1]} · {intervalLabel(rating)}
                        </Button>
                      )}
                    </For>
                  </Show>
                  <Button
                    disabled={!loaded()?.store.canUndo() || loaded()?.store.busy}
                    onClick={handleUndo}
                  >
                    Undo
                  </Button>
                </div>
              </Show>
            </>
          }
        >
          <p>
            Review history in imported packages starts fresh in CloudReady. Reopening the same
            package restores CloudReady progress. Avoid reviewing in separate browser sessions at
            the same time.
          </p>
          <Show when={compatible().unsupported > 0}>
            <p role="status">
              {compatible().unsupported} cards use unsupported templates and cannot be studied.
            </p>
          </Show>
          <For
            each={collection()?.decks.filter((d) =>
              compatible().cards.some((c) => c.deckId === d.id),
            )}
          >
            {(item) => (
              <button
                class="rounded border bg-white p-4 text-left outline-sky-300 focus:outline-2 focus:outline-offset-2"
                onClick={handleDeck.bind(null, item.id)}
              >
                {item.name}{" "}
                <span class="text-neutral-500">
                  ({compatible().cards.filter((c) => c.deckId === item.id).length} cards)
                </span>
              </button>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
}
