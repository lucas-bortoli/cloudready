import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesystem, type FileSystemEntry } from "../../../filesystem/FileSystemClient";
import PackageFilePicker from "./PackageFilePicker";

const directory = {
  kind: "directory",
  id: "d",
  name: "Decks",
  path: "/Decks",
  createdAt: new Date(),
  updatedAt: new Date(),
} as FileSystemEntry;
const file = {
  kind: "file",
  id: "f",
  name: "deck.apkg",
  path: "/Decks/deck.apkg",
  size: 1,
  mimeType: "application/octet-stream",
  createdAt: new Date(),
  updatedAt: new Date(),
} as FileSystemEntry;
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("package file picker", () => {
  it("navigates directories and emits a selected package", async () => {
    vi.spyOn(filesystem, "list").mockResolvedValueOnce([directory]).mockResolvedValueOnce([file]);
    const select = vi.fn();
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => <PackageFilePicker onSelect={select} onClose={vi.fn()} />, root);
    await flush();
    Array.from(root.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Decks"))!
      .click();
    await flush();
    Array.from(root.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("deck.apkg"))!
      .click();
    expect(select).toHaveBeenCalledWith("/Decks/deck.apkg", "deck.apkg");
    dispose();
    root.remove();
  });

  it("shows filesystem errors", async () => {
    vi.spyOn(filesystem, "list").mockRejectedValue(new Error("Offline"));
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => <PackageFilePicker onSelect={vi.fn()} onClose={vi.fn()} />, root);
    await flush();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Offline");
    dispose();
    root.remove();
  });
});
