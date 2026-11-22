import { createEffect, createRoot, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import WindowManager, {
  WindowActivationOwnerError,
  WindowOverlayAlreadyRegisteredError,
} from "./WindowManager";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

function setup() {
  const manager = new WindowManager();
  const first = manager.createWindow();
  const second = manager.createWindow();
  flush();
  const container = document.createElement("div");
  document.body.append(container);
  function button(parent: HTMLElement = container) {
    const element = document.createElement("button");
    parent.append(element);
    return element;
  }
  const frame = button();
  const child = button(frame);
  const otherFrame = button();
  const overlay = button();
  const otherOverlay = button();
  const outside = button();
  manager.registerFrame(first, frame);
  manager.registerFrame(second, otherFrame);
  const stop = manager.attachActivationTracking(document);
  cleanups.push(() => container.remove(), stop);
  return {
    manager,
    first,
    second,
    frame,
    child,
    otherFrame,
    overlay,
    otherOverlay,
    outside,
    button,
    stop,
  };
}

describe("window activation", () => {
  it("follows focus through frames, descendants and multiple independent overlays", () => {
    const { manager, first, second, child, otherFrame, overlay, otherOverlay, outside } = setup();
    const registration = manager.registerOwnedOverlay(first, overlay);
    manager.registerOwnedOverlay(first, otherOverlay);
    child.focus();
    flush();
    expect(manager.activeWindowId()).toBe(first);
    overlay.focus();
    flush();
    expect(manager.activeWindowId()).toBe(first);
    otherOverlay.focus();
    registration.dispose();
    registration.dispose();
    flush();
    expect(manager.activeWindowId()).toBe(first);
    otherFrame.focus();
    flush();
    expect(manager.activeWindowId()).toBe(second);
    overlay.focus();
    flush();
    expect(manager.activeWindowId()).toBeNull();
    outside.focus();
    flush();
    expect(manager.activeWindowId()).toBeNull();
  });

  it("does not publish an inactive state during owned focus transfers", async () => {
    const { manager, first, frame, overlay } = setup();
    manager.registerOwnedOverlay(first, overlay);
    frame.focus();
    const changes: Array<string | null> = [];
    createRoot((dispose) => {
      cleanups.push(dispose);
      createEffect(manager.activeWindowId, (id) => {
        changes.push(id);
      });
      flush();
    });
    overlay.focus();
    frame.focus();
    await Promise.resolve();
    expect(changes).toEqual([first]);
  });

  it("resolves the nearest registration and refreshes already-focused elements", () => {
    const { manager, first, second, frame, overlay, button } = setup();
    const nested = button(frame);
    nested.focus();
    const inner = manager.registerOwnedOverlay(second, nested);
    flush();
    expect(manager.activeWindowId()).toBe(second);
    inner.dispose();
    flush();
    expect(manager.activeWindowId()).toBe(first);
    overlay.focus();
    flush();
    expect(manager.activeWindowId()).toBeNull();
    const registration = manager.registerOwnedOverlay(first, overlay);
    flush();
    expect(manager.activeWindowId()).toBe(first);
    registration.dispose();
    flush();
    expect(manager.activeWindowId()).toBeNull();
    manager.registerFrame(first, overlay);
    flush();
    expect(manager.activeWindowId()).toBe(first);
    manager.unregisterFrame(first);
    flush();
    expect(manager.activeWindowId()).toBeNull();
  });

  it("clears on browser blur and reconciles focus when the browser returns", () => {
    const { manager, first, frame, outside } = setup();
    frame.focus();
    window.dispatchEvent(new Event("blur"));
    flush();
    expect(manager.activeWindowId()).toBeNull();
    outside.focus();
    frame.focus();
    flush();
    expect(manager.activeWindowId()).toBeNull();
    window.dispatchEvent(new Event("focus"));
    flush();
    expect(manager.activeWindowId()).toBe(first);
    outside.focus();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    flush();
    expect(manager.activeWindowId()).toBeNull();
  });

  it("reconciles a focus loss with no replacement focus target", async () => {
    const { manager, frame } = setup();
    frame.focus();
    frame.blur();
    await Promise.resolve();
    flush();
    expect(manager.activeWindowId()).toBeNull();
  });

  it("rejects invalid owners and duplicate registrations with named errors", () => {
    const { manager, first, second, overlay } = setup();
    manager.registerOwnedOverlay(first, overlay);
    expect(() => manager.registerOwnedOverlay(second, overlay)).toThrow(
      WindowOverlayAlreadyRegisteredError,
    );
    manager.setMinimized(second, true);
    expect(() => manager.registerOwnedOverlay(second, document.createElement("div"))).toThrow(
      WindowActivationOwnerError,
    );
    manager.destroyWindow(first);
    expect(() => manager.registerOwnedOverlay(first, document.createElement("div"))).toThrow(
      WindowActivationOwnerError,
    );
    manager.finishDestroyWindow(first);
    expect(() => manager.registerOwnedOverlay(first, document.createElement("div"))).toThrow(
      WindowActivationOwnerError,
    );
  });

  it("deactivates minimizing and closing owners and clears destroyed registrations", () => {
    const { manager, first, second, frame, overlay, otherFrame } = setup();
    const registration = manager.registerOwnedOverlay(first, overlay);
    overlay.focus();
    manager.destroyWindow(first);
    flush();
    expect(manager.activeWindowId()).toBeNull();
    manager.finishDestroyWindow(first);
    const replacement = manager.registerOwnedOverlay(second, overlay);
    registration.dispose();
    flush();
    expect(manager.activeWindowId()).toBe(second);
    replacement.dispose();
    flush();
    expect(manager.activeWindowId()).toBeNull();
    otherFrame.focus();
    manager.setMinimized(second, true);
    flush();
    expect(manager.activeWindowId()).toBeNull();
    manager.setMinimized(second, false);
    flush();
    expect(manager.activeWindowId()).toBe(second);
    frame.focus();
    flush();
    expect(manager.activeWindowId()).toBeNull();
  });

  it("deactivates immediately while a minimize animation is still running", () => {
    const { manager, first, frame, overlay } = setup();
    frame.focus();
    vi.spyOn(manager.motion, "setMinimized").mockImplementation(() => {
      vi.spyOn(manager.motion, "isMinimizing").mockReturnValue(true);
    });
    manager.setMinimized(first, true);
    expect(manager.getWindows()[0].isMinimized).toBe(false);
    flush();
    expect(manager.activeWindowId()).toBeNull();
    expect(() => manager.registerOwnedOverlay(first, overlay)).toThrow(WindowActivationOwnerError);
  });

  it("tears down listeners, registrations and queued reconciliation idempotently", async () => {
    const { manager, first, second, frame, overlay, stop } = setup();
    const registration = manager.registerOwnedOverlay(first, overlay);
    frame.focus();
    frame.blur();
    stop();
    stop();
    registration.dispose();
    overlay.focus();
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    flush();
    expect(manager.activeWindowId()).toBeNull();
    const restart = manager.attachActivationTracking(document);
    cleanups.push(restart);
    const replacement = manager.registerOwnedOverlay(second, overlay);
    window.dispatchEvent(new Event("focus"));
    registration.dispose();
    flush();
    expect(manager.activeWindowId()).toBe(second);
    replacement.dispose();
  });
});
