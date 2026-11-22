import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { createRoot, flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import WindowManager, { WindowActivationOwnerError } from "./WindowManager";

describe("WindowManager state", () => {
  it("registers an overlay before its owner creation settles", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const owner = manager.createWindow();
        const overlay = document.createElement("div");
        const registration = manager.registerOwnedOverlay(owner, overlay);
        registration.dispose();
        manager.setMinimized(owner, true);
        expect(() => manager.registerOwnedOverlay(owner, overlay)).toThrow(
          WindowActivationOwnerError,
        );
        manager.finishDestroyWindow(owner);
        dispose();
      },
      { scenario: "immediate-window-overlay" },
    );
    expectNoDiagnostics(artifact);
  });

  it("docks and minimizes windows before creation settles", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const docked = manager.createWindow();
        manager.setDock(docked, "dock-left");
        expect(manager.getWindows()[0]).toMatchObject({
          dock: "dock-left",
          isAutoPositioned: false,
        });
        const minimized = manager.createWindow();
        manager.setMinimized(minimized, true);
        expect(manager.getWindows()[1].isMinimized).toBe(true);
        manager.setMinimized(minimized, false);
        expect(manager.getWindows()[1].isMinimized).toBe(false);
        manager.finishDestroyWindow(docked);
        manager.finishDestroyWindow(minimized);
        dispose();
      },
      { scenario: "immediate-window-dock-and-minimize" },
    );
    expectNoDiagnostics(artifact);
  });

  it("destroys newly created windows before creation settles", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const reduced = vi.spyOn(manager.motion, "prefersReducedMotion").mockReturnValue(true);
        const immediate = manager.createWindow();
        expect(manager.destroyWindow(immediate)).toBe(true);
        expect(manager.destroyWindow(immediate)).toBe(false);
        expect(manager.getWindows()).toHaveLength(0);

        reduced.mockReturnValue(false);
        const animated = manager.createWindow();
        expect(manager.destroyWindow(animated)).toBe(true);
        expect(manager.destroyWindow(animated)).toBe(false);
        expect(manager.getWindows()[0].isClosing).toBe(true);
        manager.finishDestroyWindow(animated);
        expect(manager.getWindows()).toHaveLength(0);
        reduced.mockRestore();
        dispose();
      },
      { scenario: "immediate-window-close" },
    );
    expectNoDiagnostics(artifact);
  });

  it("finishes destroying a window before its creation settles", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const removed = manager.createWindow();
        const retained = manager.createWindow();
        manager.finishDestroyWindow(removed);
        manager.finishDestroyWindow(removed);
        expect(manager.getWindows().map((window) => window.id)).toEqual([retained]);
        manager.finishDestroyWindow(retained);
        dispose();
      },
      { scenario: "immediate-window-destruction" },
    );
    expectNoDiagnostics(artifact);
  });

  it("pins a newly created window before its creation settles", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const pinned = manager.createWindow();
        manager.setPinned(pinned, true);
        const ordinary = manager.createWindow();
        flush();
        const windows = manager.getWindows();
        expect(windows[0].isPinned).toBe(true);
        expect(windows[0].zIndex()).toBeGreaterThan(windows[1].zIndex());
        manager.setPinned(pinned, false);
        expect(windows[0].isPinned).toBe(false);
        manager.finishDestroyWindow(pinned);
        manager.finishDestroyWindow(ordinary);
        dispose();
      },
      { scenario: "immediate-window-pinning" },
    );
    expectNoDiagnostics(artifact);
  });

  it("applies stacking operations before newly created windows settle", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const first = manager.createWindow();
        const second = manager.createWindow();
        manager.bringToTop(first);
        flush();
        const windows = manager.getWindows();
        expect(windows[0].zIndex()).toBeGreaterThan(windows[1].zIndex());
        manager.sendBack(first);
        flush();
        expect(windows[0].zIndex()).toBeLessThan(windows[1].zIndex());
        manager.finishDestroyWindow(first);
        manager.bringToTop(first);
        manager.finishDestroyWindow(second);
        dispose();
      },
      { scenario: "immediate-window-stacking" },
    );
    expectNoDiagnostics(artifact);
  });

  it("updates and removes windows across consecutive operations", async () => {
    const { artifact } = await captureArtifact(
      () => {
        let dispose = () => {};
        const manager = createRoot((cleanup) => {
          dispose = cleanup;
          return new WindowManager();
        });
        const first = manager.createWindow({ title: "First" });
        const second = manager.createWindow({ title: "Second" });
        manager.setTitle(first, "Updated");
        manager.setPosition(first, { x: 10, y: 20 });
        manager.setResizable(second, false);
        expect(manager.getWindows()).toHaveLength(2);
        expect(manager.getWindows()[0]).toMatchObject({
          title: "Updated",
          position: { x: 10, y: 20 },
          isAutoPositioned: false,
        });
        expect(manager.getWindows()[1].isResizable).toBe(false);
        manager.finishDestroyWindow(first);
        expect(manager.getWindows().map((window) => window.id)).toEqual([second]);
        dispose();
      },
      { scenario: "window-manager-state" },
    );
    expectNoDiagnostics(artifact);
  });
});
