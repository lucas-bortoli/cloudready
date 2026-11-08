import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerProvider } from "../../../components/layer-manager/LayerContext";
import { ContextMenuProvider } from "../../../components/context-menu/ContextMenuContext";
import type { FileSystemEntry } from "../../../filesystem/FileSystemClient";
import type { NavigationController } from "../navigation-controller";
import BrowserPanel from "./BrowserPanel";

const directory = {
  id: "directory",
  kind: "directory",
  name: "Folder",
  path: "/Folder",
  createdAt: new Date(),
  updatedAt: new Date(),
} as FileSystemEntry;

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function setup() {
  const [path, navigateTo] = createSignal("/");
  const [entries, setEntries] = createSignal<FileSystemEntry[]>([directory]);
  const [selectedItems, setSelectedItems] = createSignal<ReadonlySet<string>>(new Set());
  const [searchQuery, setSearchQuery] = createSignal("");
  const [canGoBack, setCanGoBack] = createSignal(false);
  const [canGoForward, setCanGoForward] = createSignal(false);
  const goBack = vi.fn();
  const goForward = vi.fn();
  const controller: NavigationController = {
    path,
    navigateTo,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    entries,
    selectedItems,
    setSelectedItems,
    searchQuery,
    setSearchQuery,
  };
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(
    () => (
      <LayerProvider>
        <ContextMenuProvider>
          <BrowserPanel controller={controller} />
        </ContextMenuProvider>
      </LayerProvider>
    ),
    container,
  );
  cleanups.push(() => {
    dispose();
    container.remove();
  });
  return {
    container,
    list: container.querySelector<HTMLOListElement>('[role="option"]')!.parentElement!,
    entry: container.querySelector<HTMLElement>('[role="option"]')!,
    navigateTo,
    setEntries,
    setCanGoBack,
    setCanGoForward,
    goBack,
    goForward,
  };
}

describe("BrowserPanel navigation focus", () => {
  it("enables history controls when navigation is available", () => {
    const { container, setCanGoBack, setCanGoForward, goBack, goForward } = setup();
    const back = container.querySelector<HTMLButtonElement>('[aria-label="Back"]')!;
    const forward = container.querySelector<HTMLButtonElement>('[aria-label="Forward"]')!;
    expect(back.getAttribute("aria-disabled")).toBe("true");
    expect(forward.getAttribute("aria-disabled")).toBe("true");
    back.click();
    forward.click();
    expect(goBack).not.toHaveBeenCalled();
    expect(goForward).not.toHaveBeenCalled();
    setCanGoBack(true);
    setCanGoForward(true);
    back.click();
    forward.click();
    expect(goBack).toHaveBeenCalledOnce();
    expect(goForward).toHaveBeenCalledOnce();
  });

  it("makes entries reachable by Tab and selectable with Space", () => {
    const { entry } = setup();
    expect(entry.tabIndex).toBe(0);
    entry.focus();
    entry.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
    );
    expect(entry.getAttribute("aria-selected")).toBe("true");
  });

  it("opens a focused directory with Enter and retains focus in the list", () => {
    const { list, entry, setEntries } = setup();
    entry.focus();
    entry.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(list);
    setEntries([]);
    expect(document.activeElement).toBe(list);
  });

  it("keeps focus in the entry list when a focused directory is opened", () => {
    const { list, entry, setEntries } = setup();
    entry.focus();
    entry.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(document.activeElement).toBe(list);
    setEntries([]);
    expect(document.activeElement).toBe(list);
  });

  it("does not steal focus from another control during navigation or a later listing", () => {
    const { container, entry, navigateTo, setEntries } = setup();
    const search = container.querySelector<HTMLTextAreaElement>("textarea")!;
    search.focus();
    navigateTo("/Folder");
    expect(document.activeElement).toBe(search);
    setEntries([]);
    expect(document.activeElement).toBe(search);
    expect(entry.isConnected).toBe(false);
  });

  it("does not reclaim focus after the user leaves while a listing loads", () => {
    const { container, entry, navigateTo, setEntries } = setup();
    entry.focus();
    navigateTo("/Folder");
    const search = container.querySelector<HTMLTextAreaElement>("textarea")!;
    search.focus();
    setEntries([]);
    expect(document.activeElement).toBe(search);
  });

  it("keeps focus in the list when a directory is opened from its context menu", async () => {
    const { list, entry, setEntries } = setup();
    entry.focus();
    entry.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
    await Promise.resolve();
    document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(document.activeElement).toBe(list);
    setEntries([]);
    expect(document.activeElement).toBe(list);
  });
});
