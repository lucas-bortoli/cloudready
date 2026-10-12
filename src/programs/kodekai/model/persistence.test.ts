// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { FileSystemEntryNotFoundError } from "../../../filesystem/errors";
import { KodekaiStore } from "./persistence";

afterEach(() => vi.restoreAllMocks());

describe("KodekaiStore", () => {
  it("shares a user's model and reports failed saves until a retry succeeds", async () => {
    vi.spyOn(filesystem, "readFile").mockRejectedValue(new FileSystemEntryNotFoundError("Missing"));
    vi.spyOn(filesystem, "createDirectory").mockResolvedValue({} as never);
    vi.spyOn(filesystem, "createFile").mockResolvedValue({} as never);
    const write = vi
      .spyOn(filesystem, "writeFile")
      .mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValue({} as never);
    const userId = crypto.randomUUID();
    const store = await KodekaiStore.open(userId);
    expect(await KodekaiStore.open(userId)).toBe(store);

    store.model.createProject({ title: "Work" });
    await store.save();
    expect(store.getStatus()).toMatchObject({ dirty: true, error: expect.any(Error) });

    await store.save();
    expect(store.getStatus()).toEqual({ dirty: false, error: undefined });
    expect(write).toHaveBeenCalledTimes(2);
  });
});
