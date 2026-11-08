import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { FileSystemEntryNotFoundError } from "../../../filesystem/errors";
import type { LoadedPackage } from "../browser/session";
import { ProgressStore } from "../browser/store";
import { createReviewController } from "./createReviewController";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("review controller", () => {
  it("replaces store subscriptions and cleans up the active one", async () => {
    vi.spyOn(filesystem, "readFile").mockRejectedValue(new FileSystemEntryNotFoundError("missing"));
    const firstStore = await ProgressStore.open("review-controller-test", "first", "first");
    const secondStore = await ProgressStore.open("review-controller-test", "second", "second");
    const firstUnsubscribe = vi.fn();
    const secondUnsubscribe = vi.fn();
    const firstSubscribe = vi.spyOn(firstStore, "subscribe").mockReturnValue(firstUnsubscribe);
    const secondSubscribe = vi.spyOn(secondStore, "subscribe").mockReturnValue(secondUnsubscribe);
    const collection = {
      decks: [],
      types: [],
      notes: [],
      cards: [],
      media: {},
      hasReviewHistory: false,
    };
    const first: LoadedPackage = { hash: "first", collection, store: firstStore };
    const second: LoadedPackage = { hash: "second", collection, store: secondStore };
    let setLoaded!: (value: LoadedPackage) => LoadedPackage;
    const root = document.createElement("div");
    const dispose = render(() => {
      const [loaded, updateLoaded] = createSignal<LoadedPackage | undefined>(first);
      setLoaded = updateLoaded;
      const review = createReviewController(loaded);
      return <span>{review.deckId()}</span>;
    }, root);
    expect(firstSubscribe).toHaveBeenCalledOnce();
    setLoaded(second);
    expect(firstUnsubscribe).toHaveBeenCalledOnce();
    expect(secondSubscribe).toHaveBeenCalledOnce();
    dispose();
    expect(secondUnsubscribe).toHaveBeenCalledOnce();
  });
});
