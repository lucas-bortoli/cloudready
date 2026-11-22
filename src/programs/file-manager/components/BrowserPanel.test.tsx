import { createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerProvider } from "../../../components/layer-manager/LayerContext";
import { ContextMenuProvider } from "../../../components/context-menu/ContextMenuContext";
import { filesystem, type FileSystemEntry } from "../../../filesystem/FileSystemClient";
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
afterEach(() => vi.restoreAllMocks());

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
    refresh: vi.fn(),
  };
  const [currentController, setCurrentController] = createSignal(controller);
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(
    () => (
      <LayerProvider>
        <ContextMenuProvider>
          <BrowserPanel controller={currentController()} />
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
    path,
    navigateTo,
    setEntries,
    setCanGoBack,
    setCanGoForward,
    goBack,
    goForward,
    controller,
    setCurrentController,
  };
}

describe("BrowserPanel navigation focus", () => {
  it("uses the replacement controller for rendering and actions without diagnostics", async () => {
    const { container, controller, setCurrentController } = setup();
    const replacementBack = vi.fn();
    const [replacementPath, setReplacementPath] = createSignal("/replacement");
    const [replacementCanGoBack, setReplacementCanGoBack] = createSignal(false);
    const [replacementEntries, setReplacementEntries] = createSignal<FileSystemEntry[]>([
      directory,
    ]);
    const replacement: NavigationController = {
      ...controller,
      path: replacementPath,
      canGoBack: replacementCanGoBack,
      goBack: replacementBack,
      entries: replacementEntries,
    };
    const { artifact } = await captureArtifact(() => {
      setCurrentController(replacement);
      setReplacementPath("/updated-replacement");
      setReplacementCanGoBack(true);
      setReplacementEntries([]);
      flush();
      expect(container.textContent).toContain("updated-replacement");
      expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
      container.querySelector<HTMLButtonElement>('[aria-label="Back"]')!.click();
      expect(replacementBack).toHaveBeenCalledOnce();
    });
    expectNoDiagnostics(artifact);
  });

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
    flush();
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
    flush();
    expect(entry.getAttribute("aria-selected")).toBe("true");
  });

  it("opens a focused directory with Enter and retains focus in the list", () => {
    const { list, entry, setEntries } = setup();
    entry.focus();
    entry.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    flush();
    expect(document.activeElement).toBe(list);
    setEntries([]);
    flush();
    expect(document.activeElement).toBe(list);
  });

  it("keeps focus in the entry list when a focused directory is opened", () => {
    const { list, entry, setEntries } = setup();
    entry.focus();
    entry.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    flush();
    expect(document.activeElement).toBe(list);
    setEntries([]);
    flush();
    expect(document.activeElement).toBe(list);
  });

  it("does not steal focus from another control during navigation or a later listing", () => {
    const { container, entry, navigateTo, setEntries } = setup();
    const search = container.querySelector<HTMLTextAreaElement>("textarea")!;
    search.focus();
    navigateTo("/Folder");
    flush();
    expect(document.activeElement).toBe(search);
    setEntries([]);
    flush();
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
    flush();
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
    flush();
    expect(document.activeElement).toBe(list);
    setEntries([]);
    flush();
    expect(document.activeElement).toBe(list);
  });

  it("navigates from a breadcrumb without reactive diagnostics", async () => {
    const { artifact } = await captureArtifact(
      () => {
        const { container, navigateTo, path } = setup();
        navigateTo("/one/two");
        flush();
        const segment = Array.from(container.querySelectorAll("li")).find(
          (element) => element.textContent === "one",
        );
        expect(segment).toBeDefined();
        segment!.click();
        flush();
        expect(path()).toBe("/one");
      },
      { scenario: "file-manager-breadcrumb-navigation" },
    );
    expectNoDiagnostics(artifact);
  });

  it("imports a local file into the chosen directory", async () => {
    const create = vi.spyOn(filesystem, "createFile").mockResolvedValue({} as never);
    const write = vi.spyOn(filesystem, "writeFile").mockResolvedValue({} as never);
    const { container, navigateTo } = setup();
    navigateTo("/Folder");
    flush();
    container.querySelector<HTMLButtonElement>('[title="Import files"]')!.click();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["hello"], "sample.lap");
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith("/Folder/sample.lap", file));
    expect(create).toHaveBeenCalledWith("/Folder/sample.lap");
  });
});
