import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  type Accessor,
} from "solid-js";
import { createAudioPlayer } from "../browser/audio-player";
import type { LoadedPackage } from "../browser/session";
import type { AnkiCard } from "../core/anki";
import { newCard, schedule, type Rating } from "../core/fsrs";
import { reviewQueue } from "../core/progress";
import { renderCard, type RenderedCard } from "../core/template";

/**

 * A deck with at least one card supported by the renderer.

 */
export interface DeckSummary {
  id: string;
  name: string;
  cardCount: number;
}

/**

 * Available cards and the earliest future review in the selected deck.

 */
export interface QueueSummary {
  due: number;
  fresh: number;
  nextDue: number | undefined;
}

/**

 * Read-only review state and actions for a Flashcards window.

 */
export interface ReviewController {
  readonly decks: Accessor<DeckSummary[]>;
  readonly unsupported: Accessor<number>;
  readonly deckId: Accessor<string>;
  readonly deckName: Accessor<string>;
  readonly summary: Accessor<QueueSummary>;
  readonly dailyLimit: Accessor<number>;
  readonly currentCard: Accessor<AnkiCard | undefined>;
  readonly rendered: Accessor<RenderedCard | undefined>;
  readonly revealed: Accessor<boolean>;
  readonly saving: Accessor<boolean>;
  readonly saveError: Accessor<unknown>;
  readonly canUndo: Accessor<boolean>;
  /**
   * Opens a deck and resets its visible answer.
   */
  selectDeck(id: string): void;
  /**
   * Returns to the deck list and stops audio.
   */
  closeDeck(): void;
  /**
   * Shows the answer and plays its audio.
   */
  reveal(): void;
  /**
   * Replays audio for the visible side.
   */
  replay(): void;
  /**
   * Rates the active card; progress is persisted by the shared store.
   */
  rate(rating: Rating): void;
  /**
   * Restores the last rating from this session.
   */
  undo(): void;
  /**
   * Saves the selected deck's new-card limit.
   */
  setLimit(limit: number): void;
  /**
   * Retries a failed progress write.
   */
  retrySave(): void;
  /**
   * Previews the interval for a rating without changing progress.
   */
  intervalLabel(rating: Rating): string;
}

/**
 * Creates review state scoped to a Solid owner. Store subscriptions, the clock,
 * and audio are detached when the owner is disposed or its package changes.
 */
export function createReviewController(
  loaded: Accessor<LoadedPackage | undefined>,
): ReviewController {
  const [deckId, setDeckId] = createSignal("");
  const [revealed, setRevealed] = createSignal(false);
  const [revision, setRevision] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const player = createAudioPlayer();
  const timer = window.setInterval(() => {
    setNow(Date.now());
  }, 1000);

  onCleanup(() => {
    window.clearInterval(timer);
    player.dispose();
  });

  createEffect(
    on(loaded, (current) => {
      // A subscription belongs to one package even when two windows share its store.
      setDeckId("");
      setRevealed(false);
      player.stop();
      setRevision((value) => value + 1);
      if (current) {
        const unsubscribe = current.store.subscribe(() => {
          setRevision((value) => value + 1);
        });
        onCleanup(unsubscribe);
      }
    }),
  );

  const collection = createMemo(() => {
    return loaded()?.collection;
  });
  const noteMap = createMemo(
    () => new Map(collection()?.notes.map((note) => [note.id, note]) ?? []),
  );
  const typeMap = createMemo(
    () => new Map(collection()?.types.map((type) => [type.id, type]) ?? []),
  );
  const deckMap = createMemo(
    () => new Map(collection()?.decks.map((deck) => [deck.id, deck]) ?? []),
  );

  const compatible = createMemo(() => {
    const cards: AnkiCard[] = [];
    let unsupported = 0;
    for (const card of collection()?.cards ?? []) {
      const note = noteMap().get(card.noteId);
      const type = note && typeMap().get(note.typeId);
      try {
        if (!note || !type) {
          unsupported += 1;
          continue;
        }
        renderCard(card, note, type, deckMap().get(card.deckId)?.name ?? "");
        cards.push(card);
      } catch {
        unsupported += 1;
      }
    }
    return { cards, unsupported };
  });

  const decks = createMemo(() => {
    const counts = new Map<string, number>();
    for (const card of compatible().cards) {
      counts.set(card.deckId, (counts.get(card.deckId) ?? 0) + 1);
    }
    return (collection()?.decks ?? [])
      .filter((deck) => counts.has(deck.id))
      .map((deck) => ({ id: deck.id, name: deck.name, cardCount: counts.get(deck.id) ?? 0 }));
  });
  const unsupported = createMemo(() => {
    return compatible().unsupported;
  });
  const deckName = createMemo(() => {
    return deckMap().get(deckId())?.name ?? "";
  });
  const queue = createMemo(() => {
    revision();
    const current = loaded();
    if (!current || !deckId()) {
      return [];
    }
    return reviewQueue(compatible().cards, current.store.progress, deckId(), now());
  });
  const summary = createMemo((): QueueSummary => {
    revision();
    const store = loaded()?.store;
    if (!store || !deckId()) {
      return { due: 0, fresh: 0, nextDue: undefined };
    }
    const due = queue().filter((card) => Boolean(store.progress.cards[card.id])).length;
    const future = compatible()
      .cards.filter(
        (card) => card.deckId === deckId() && store.progress.cards[card.id]?.due > now(),
      )
      .map((card) => store.progress.cards[card.id].due);
    return {
      due,
      fresh: queue().length - due,
      nextDue: future.length ? Math.min(...future) : undefined,
    };
  });
  const selection = createMemo<{
    package: LoadedPackage | undefined;
    deckId: string;
    card: AnkiCard | undefined;
  }>((previous) => {
    const currentPackage = loaded();
    const selectedDeck = deckId();
    const cards = queue();
    let current: AnkiCard | undefined;
    // A newly due card joins the queue without interrupting the card on screen.
    if (previous && previous.package === currentPackage && previous.deckId === selectedDeck) {
      current = cards.find((card) => card.id === previous.card?.id);
    }
    return { package: currentPackage, deckId: selectedDeck, card: current ?? cards[0] };
  });
  const currentCard = createMemo(() => {
    return selection().card;
  });
  const rendered = createMemo(() => {
    const card = currentCard();
    if (!card) {
      return undefined;
    }
    const note = noteMap().get(card.noteId);
    const type = note && typeMap().get(note.typeId);
    if (!note || !type) {
      return undefined;
    }
    return renderCard(card, note, type, deckName());
  });
  const saving = createMemo(() => {
    revision();
    return loaded()?.store.busy ?? false;
  });
  const saveError = createMemo(() => {
    revision();
    return loaded()?.store.error;
  });
  const canUndo = createMemo(() => {
    revision();
    return loaded()?.store.canUndo() ?? false;
  });
  const dailyLimit = createMemo(() => {
    revision();
    return loaded()?.store.progress.dailyLimit[deckId()] ?? 20;
  });

  const play = (names: readonly string[]): void => {
    player.play(names, collection()?.media ?? {});
  };
  let playedCard = "";
  createEffect(() => {
    const card = currentCard();
    const id = card ? `${deckId()}:${card.id}` : "";
    if (id !== playedCard) {
      playedCard = id;
      setRevealed(false);
      if (card) {
        // Automatic question audio is attempted once per card, not on clock ticks.
        play(rendered()?.frontAudio ?? []);
      }
    }
  });

  const selectDeck = (id: string): void => {
    setDeckId(id);
    setRevealed(false);
  };
  const closeDeck = (): void => {
    setDeckId("");
    setRevealed(false);
    player.stop();
  };
  const reveal = (): void => {
    setRevealed(true);
    play(rendered()?.backAudio ?? []);
  };
  const replay = (): void => {
    const card = rendered();
    const sounds = revealed() ? card?.backAudio : card?.frontAudio;
    play(sounds ?? []);
  };
  const rate = (rating: Rating): void => {
    const card = currentCard();
    const store = loaded()?.store;
    if (card && store && !store.busy && !store.error) {
      // The queue and answer update as one transition, avoiding a flash of the old front.
      batch(() => {
        setRevealed(false);
        void store.rate(card, rating);
      });
    }
  };
  const undo = (): void => {
    setRevealed(false);
    void loaded()?.store.undo();
  };
  const setLimit = (limit: number): void => {
    void loaded()?.store.setLimit(deckId(), limit);
  };
  const retrySave = (): void => {
    void loaded()?.store.save();
  };
  const intervalLabel = (rating: Rating): string => {
    const card = currentCard();
    const store = loaded()?.store;
    if (!card || !store) {
      return "";
    }
    const timestamp = now();
    const interval =
      schedule(store.progress.cards[card.id] ?? newCard(), rating, timestamp).card.due - timestamp;
    if (interval < 3600000) {
      return `${Math.round(interval / 60000)}m`;
    }
    if (interval < 86400000) {
      return `${Math.round(interval / 3600000)}h`;
    }
    return `${Math.round(interval / 86400000)}d`;
  };

  return {
    decks,
    unsupported,
    deckId,
    deckName,
    summary,
    dailyLimit,
    currentCard,
    rendered,
    revealed,
    saving,
    saveError,
    canUndo,
    selectDeck,
    closeDeck,
    reveal,
    replay,
    rate,
    undo,
    setLimit,
    retrySave,
    intervalLabel,
  };
}
