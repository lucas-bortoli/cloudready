import { render } from "solid-js/web";
import { LayerProvider } from "../../components/layer-manager/LayerContext";
import {
  WindowManagerProvider,
  useWindowManager,
} from "../../components/window-manager/WindowManagerContext";
import WindowsOutlet from "../../components/window-manager/WindowsOutlet";
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
    cleanup = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <Flashcards userId="test" />
            <WindowsOutlet />
          </WindowManagerProvider>
        </LayerProvider>
      ),
      root,
    );
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array([1])], "test.apkg");
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    findButton(root, "Deck").click();
    await flush();
    const reviewWindow = root.querySelector('[x-role="window"]');
    expect(reviewWindow?.textContent).toContain("Flashcards review");
    expect(root.querySelector('[x-role="flashcards"] iframe')).toBeNull();
    expect(reviewWindow?.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
    findButton(root, "Show answer").click();
    expect(root.textContent).toContain("Good");
    findButton(root, "Good").click();
    expect(example.store.rate).toHaveBeenCalledWith(example.collection.cards[0], 3);
  });
  it("closes the review window and allows reopening from the deck list", async () => {
    vi.spyOn(session, "openPackage").mockResolvedValue(example);
    vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    cleanup = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <Flashcards userId="test" />
            <WindowsOutlet />
          </WindowManagerProvider>
        </LayerProvider>
      ),
      root,
    );
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["a"], "test.apkg")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    findButton(root, "Deck").click();
    const reviewWindow = root.querySelector<HTMLElement>('[x-role="window"]')!;
    const closeButton = reviewWindow.querySelector<HTMLButtonElement>(
      '[aria-label="Close window"]',
    )!;
    closeButton.click();
    expect(reviewWindow.dataset.windowMotion).toBe("closing");
    expect(root.querySelector('[x-role="flashcards"]')?.textContent).toContain("Deck");
    findButton(root.querySelector<HTMLElement>('[x-role="flashcards"]')!, "Deck").click();
    expect(root.querySelectorAll('[x-role="window"]')).toHaveLength(2);
    expect(root.querySelectorAll("iframe")).toHaveLength(1);
  });
  it("closes the review window when the package is reopened", async () => {
    vi.spyOn(session, "openPackage").mockResolvedValue(example);
    vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    cleanup = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <Flashcards userId="test" />
            <WindowsOutlet />
          </WindowManagerProvider>
        </LayerProvider>
      ),
      root,
    );
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["a"], "test.apkg")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    findButton(root, "Deck").click();
    const reviewWindow = root.querySelector<HTMLElement>('[x-role="window"]')!;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    expect(reviewWindow.dataset.windowMotion).toBe("closing");
    expect(reviewWindow.querySelector("iframe")).toBeNull();
  });
  it("closes the review window when its main window is closed", async () => {
    vi.spyOn(session, "openPackage").mockResolvedValue(example);
    const release = vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    const TestWindow = () => {
      const manager = useWindowManager();
      manager.createWindow({
        title: "Flashcards",
        closer: () => true,
        content: () => <Flashcards userId="test" />,
      });
      return <WindowsOutlet />;
    };
    cleanup = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <TestWindow />
          </WindowManagerProvider>
        </LayerProvider>
      ),
      root,
    );
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["a"], "test.apkg")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    await flush();
    findButton(root, "Deck").click();
    const windows = root.querySelectorAll<HTMLElement>('[x-role="window"]');
    expect(windows).toHaveLength(2);
    windows[0].querySelector<HTMLButtonElement>('[aria-label="Close window"]')!.click();
    windows[0].dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(windows[1].dataset.windowMotion).toBe("closing");
    expect(release).toHaveBeenCalledWith("test", example.hash);
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
    cleanup = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <Flashcards userId="queue-test" />
            <WindowsOutlet />
          </WindowManagerProvider>
        </LayerProvider>
      ),
      root,
    );
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
    cleanup = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <Flashcards userId="test" />
            <WindowsOutlet />
          </WindowManagerProvider>
        </LayerProvider>
      ),
      root,
    );
    findButton(root, "Open CloudReady file").click();
    await flush();
    findButton(root, "deck.apkg").click();
    await flush();
    await flush();
    expect(session.openPackage).toHaveBeenCalled();
    expect(root.textContent).toContain("Deck");
  });
});
