import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesystem } from "../../filesystem/FileSystemClient";
import { emptyProgress } from "./core/progress";
import { newCard } from "./core/fsrs";
import * as session from "./browser/session";
import Flashcards from "./Flashcards";

const example = {
  hash: "test",
  collection: {
    decks: [{ id: "d", name: "Deck" }],
    types: [
      {
        id: "t",
        name: "Basic",
        cloze: false,
        css: "",
        fields: ["Front", "Back"],
        templates: [{ name: "Card", front: "{{Front}}", back: "{{Back}}" }],
      },
    ],
    notes: [{ id: "n", guid: "g", typeId: "t", tags: "", fields: ["Question", "Answer"] }],
    cards: [{ id: "c", noteId: "n", deckId: "d", ordinal: 0, position: 1 }],
    media: {},
    hasReviewHistory: false,
  },
  store: {
    progress: emptyProgress("test", "test.apkg", "UTC"),
    busy: false,
    error: undefined,
    subscribe: () => () => {},
    canUndo: () => false,
    rate: vi.fn(),
    undo: vi.fn(),
    setLimit: vi.fn(),
    save: vi.fn(),
  },
} as unknown as session.LoadedPackage;
function findButton(root: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button ${text} not found`);
  return button;
}
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Flashcards opening flows", () => {
  it("opens a device package and shows a reveal/rating flow", async () => {
    vi.spyOn(session, "openPackage").mockResolvedValue(example);
    vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    cleanup = render(() => <Flashcards userId="test" />, root);
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array([1])], "test.apkg");
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    findButton(root, "Deck").click();
    await flush();
    expect(root.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
    findButton(root, "Show answer").click();
    expect(root.textContent).toContain("Good");
    findButton(root, "Good").click();
    expect(example.store.rate).toHaveBeenCalledWith(example.collection.cards[0], 3);
  });
  it("keeps the current card visible when another becomes due, then shows it after rating", async () => {
    const progress = emptyProgress("queue-test", "test.apkg", "UTC");
    const timestamp = Date.now();
    progress.cards.second = {
      ...newCard(),
      phase: "learning",
      due: timestamp + 500,
      lastReview: timestamp,
      stability: 1,
      difficulty: 5,
      repetitions: 1,
    };
    const listeners = new Set<() => void>();
    const store = {
      ...example.store,
      progress,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      rate: vi.fn(async () => {
        progress.cards.c = {
          ...newCard(),
          phase: "learning",
          due: Date.now() + 60000,
          lastReview: Date.now(),
          stability: 1,
          difficulty: 5,
          repetitions: 1,
        };
        listeners.forEach((listener) => listener());
      }),
    };
    const loaded = {
      ...example,
      collection: {
        ...example.collection,
        notes: [
          ...example.collection.notes,
          { id: "n2", guid: "g2", typeId: "t", tags: "", fields: ["Due question", "Due answer"] },
        ],
        cards: [
          ...example.collection.cards,
          { id: "second", noteId: "n2", deckId: "d", ordinal: 0, position: 2 },
        ],
      },
      store,
    } as unknown as session.LoadedPackage;
    vi.spyOn(session, "openPackage").mockResolvedValue(loaded);
    vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    cleanup = render(() => <Flashcards userId="queue-test" />, root);
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["a"], "test.apkg")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    findButton(root, "Deck").click();
    expect(root.querySelector("iframe")?.srcdoc).toContain("Question");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(root.querySelector("iframe")?.srcdoc).toContain("Question");
    expect(root.querySelector("iframe")?.srcdoc).not.toContain("Due question");
    findButton(root, "Show answer").click();
    findButton(root, "Good").click();
    expect(root.querySelector("iframe")?.srcdoc).toContain("Due question");
  });
  it("browses and opens an apkg in the CloudReady filesystem", async () => {
    vi.spyOn(session, "openPackage").mockResolvedValue(example);
    vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    vi.spyOn(filesystem, "list").mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000000",
        path: "/deck.apkg",
        name: "deck.apkg",
        kind: "file",
        size: 1,
        mimeType: "application/octet-stream",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    vi.spyOn(filesystem, "readFile").mockResolvedValue(new Blob(["a"]));
    const root = document.createElement("div");
    document.body.append(root);
    cleanup = render(() => <Flashcards userId="test" />, root);
    findButton(root, "Open CloudReady file").click();
    await flush();
    findButton(root, "deck.apkg").click();
    await flush();
    await flush();
    expect(session.openPackage).toHaveBeenCalled();
    expect(root.textContent).toContain("Deck");
  });
});
