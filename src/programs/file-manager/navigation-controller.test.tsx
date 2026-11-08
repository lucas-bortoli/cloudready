import { createRoot } from "solid-js";
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
  return createRoot((dispose) => {
    cleanups.push(dispose);
    return createNavigationController();
  });
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
    controller.goForward();
    controller.navigateTo("/");
    expect(controller.canGoBack()).toBe(false);
    controller.navigateTo("/a");
    controller.navigateTo("/b");
    controller.navigateTo("/b");
    expect(controller.canGoBack()).toBe(true);
    controller.goBack();
    expect(controller.path()).toBe("/a");
    expect(controller.canGoForward()).toBe(true);
    controller.goBack();
    expect(controller.path()).toBe("/");
    expect(controller.canGoBack()).toBe(false);
    controller.goForward();
    expect(controller.path()).toBe("/a");
    controller.navigateTo("/c");
    expect(controller.canGoForward()).toBe(false);
    controller.goForward();
    expect(controller.path()).toBe("/c");
    controller.goBack();
    expect(controller.path()).toBe("/a");
  });

  it("clears selection when moving through history", () => {
    const controller = setup();
    controller.navigateTo("/a");
    controller.setSelectedItems(new Set(["entry"]));
    controller.goBack();
    expect(controller.selectedItems().size).toBe(0);
    controller.setSelectedItems(new Set(["entry"]));
    controller.goForward();
    expect(controller.selectedItems().size).toBe(0);
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
    controller.goBack();
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
    expect(controller.entries().map((item: FileSystemEntry) => item.name)).toEqual(["current"]);
    first.resolve([]);
    second.reject(new Error("obsolete"));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.entries().map((item: FileSystemEntry) => item.name)).toEqual(["current"]);
    expect(showDialog).not.toHaveBeenCalled();
  });
});
