import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { createRoot, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileSystemEntry } from "../../filesystem/FileSystemClient";
import { filesystem } from "../../filesystem/FileSystemClient";
import createNavigationController from "./navigation-controller";

vi.mock("../../components/dialog/Dialog", () => ({ default: () => showDialog }));
vi.mock("../../filesystem/FileSystemClient", () => ({ filesystem: { list: vi.fn() } }));
const { showDialog } = vi.hoisted(() => ({ showDialog: vi.fn() }));
const cleanups: Array<() => void> = [];

beforeEach(() => {
  vi.mocked(filesystem.list).mockReset();
  vi.mocked(filesystem.list).mockResolvedValue([]);
  showDialog.mockReset();
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function setup() {
  const controller = createRoot((dispose) => {
    cleanups.push(dispose);
    return createNavigationController();
  });
  flush();
  return controller;
}

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("file manager navigation", () => {
  it("navigates backward and forward, truncates forward history and ignores duplicate paths", () => {
    const controller = setup();
    expect(controller.path()).toBe("/");
    expect(controller.canGoBack()).toBe(false);
    expect(controller.canGoForward()).toBe(false);
    controller.goBack();
    flush();
    controller.goForward();
    flush();
    controller.navigateTo("/");
    flush();
    expect(controller.canGoBack()).toBe(false);
    controller.navigateTo("/a");
    flush();
    controller.navigateTo("/b");
    flush();
    controller.navigateTo("/b");
    flush();
    expect(controller.canGoBack()).toBe(true);
    controller.goBack();
    flush();
    expect(controller.path()).toBe("/a");
    expect(controller.canGoForward()).toBe(true);
    controller.goBack();
    flush();
    expect(controller.path()).toBe("/");
    expect(controller.canGoBack()).toBe(false);
    controller.goForward();
    flush();
    expect(controller.path()).toBe("/a");
    controller.navigateTo("/c");
    flush();
    expect(controller.canGoForward()).toBe(false);
    controller.goForward();
    flush();
    expect(controller.path()).toBe("/c");
    controller.goBack();
    flush();
    expect(controller.path()).toBe("/a");
  });

  it("clears selection when moving through history", async () => {
    const { artifact } = await captureArtifact(
      () => {
        const controller = setup();
        controller.navigateTo("/a");
        flush();
        controller.setSelectedItems(new Set(["entry"]));
        flush();
        controller.goBack();
        flush();
        expect(controller.selectedItems().size).toBe(0);
        controller.setSelectedItems(new Set(["entry"]));
        flush();
        controller.goForward();
        flush();
        expect(controller.selectedItems().size).toBe(0);
      },
      { scenario: "file-manager-navigation" },
    );
    expectNoDiagnostics(artifact);
  });

  it("ignores stale listing results and errors after navigation", async () => {
    const first = pending<Awaited<ReturnType<typeof filesystem.list>>>();
    const second = pending<Awaited<ReturnType<typeof filesystem.list>>>();
    const third = pending<Awaited<ReturnType<typeof filesystem.list>>>();
    vi.mocked(filesystem.list)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const controller = setup();
    controller.navigateTo("/a");
    flush();
    controller.goBack();
    flush();
    const entry = {
      id: "file",
      name: "current",
      path: "/current",
      kind: "directory",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof filesystem.list>>[number];
    third.resolve([entry]);
    await Promise.resolve();
    flush();
    expect(controller.entries().map((item: FileSystemEntry) => item.name)).toEqual(["current"]);
    first.resolve([]);
    second.reject(new Error("obsolete"));
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(controller.entries().map((item: FileSystemEntry) => item.name)).toEqual(["current"]);
    expect(showDialog).not.toHaveBeenCalled();
  });
});
