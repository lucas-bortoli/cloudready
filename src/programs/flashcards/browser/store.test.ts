import { beforeEach, describe, expect, it, vi } from "vitest";
import { filesystem } from "../../../filesystem/FileSystemClient";
import {
  FileSystemEntryConflictError,
  FileSystemEntryNotFoundError,
} from "../../../filesystem/errors";
import { ProgressStore } from "./store";
import type { AnkiCard } from "../core/anki";
const card: AnkiCard = { id: "c", noteId: "n", deckId: "d", ordinal: 0, position: 1 };

describe("profile progress store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(filesystem, "readFile").mockRejectedValue(new FileSystemEntryNotFoundError("missing"));
    vi.spyOn(filesystem, "createDirectory").mockRejectedValue(
      new FileSystemEntryConflictError("exists"),
    );
    vi.spyOn(filesystem, "createFile").mockRejectedValue(
      new FileSystemEntryConflictError("exists"),
    );
  });
  it("shares state across windows, retries failed writes, and undoes a rating", async () => {
    const write = vi
      .spyOn(filesystem, "writeFile")
      .mockRejectedValueOnce(new Error("disconnected"))
      .mockResolvedValue({} as never);
    const one = await ProgressStore.open("user-store-test", "hash-store-test", "deck");
    const two = await ProgressStore.open("user-store-test", "hash-store-test", "deck");
    expect(one).toBe(two);
    await one.rate(card, 1);
    expect(one.error).toBeTruthy();
    expect(one.progress.reviews).toHaveLength(1);
    await one.rate(card, 2);
    expect(one.progress.reviews).toHaveLength(1);
    await two.save();
    expect(one.error).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
    await two.undo();
    expect(one.progress.reviews).toHaveLength(0);
    expect(one.progress.cards.c).toBeUndefined();
  });
});
