// @vitest-environment happy-dom

import { createSignal, flush, Show } from "solid-js";
import { render } from "@solidjs/web";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { describe, expect, it, vi } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import WindowManager from "../window-manager/WindowManager";
import { WindowManagerProvider, useWindowManager } from "../window-manager/WindowManagerContext";
import WindowsOutlet from "../window-manager/WindowsOutlet";
import useDialog, { RejectReasonDialogCancelled, type DialogHandle } from "./Dialog";

/** Props supplied to the fixture that opens one dialog after mounting. */
interface DialogLauncherProps {
  /** Receives the promise returned by the fixture's dialog. */
  onDialogCreated: (dialog: DialogHandle<"confirm" | "cancel">) => void;
  /** Receives the manager that owns the fixture's dialog window. */
  onWindowManager: (windowManager: WindowManager) => void;
}

/** Opens a representative dialog and renders the manager's window outlet. */
function DialogLauncher(props: DialogLauncherProps) {
  const createDialog = useDialog();
  const windowManager = useWindowManager();

  const handleOpen = () => {
    props.onWindowManager(windowManager);
    props.onDialogCreated(
      createDialog({
        icon: "question",
        title: "Delete document",
        content: () => <p>Delete this document?</p>,
        actions: { confirm: "Delete", cancel: "Keep" },
      }),
    );
  };

  return (
    <>
      <button onClick={handleOpen}>Open dialog</button>
      <WindowsOutlet />
    </>
  );
}

/** Mounts a dialog fixture and returns its promise, manager, and DOM cleanup function. */
function renderDialog(settle = true) {
  const container = document.createElement("div");
  document.body.append(container);
  let dialog: DialogHandle<"confirm" | "cancel"> | undefined;
  let windowManager: WindowManager | undefined;
  const dispose = render(
    () => (
      <LayerProvider>
        <WindowManagerProvider>
          <DialogLauncher
            onDialogCreated={(createdDialog) => (dialog = createdDialog)}
            onWindowManager={(manager) => (windowManager = manager)}
          />
        </WindowManagerProvider>
      </LayerProvider>
    ),
    container,
  );

  container.querySelector<HTMLButtonElement>("button")!.click();
  if (settle) flush();

  if (!dialog || !windowManager) {
    throw new Error("Dialog was not created.");
  }

  return {
    container,
    dialog,
    windowManager,
    dispose: () => {
      // Dispose the Solid owner before removing the detached test container.
      dispose();
      container.remove();
    },
  };
}

/** Returns the visible dialog action button with the given text label. */
function button(container: HTMLElement, label: string) {
  const control = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  );

  if (!control) {
    throw new Error(`Button ${label} did not render.`);
  }

  return control;
}

describe("useDialog", () => {
  it("cleans up a dialog when its owner is removed during settlement", async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const container = document.createElement("div");
        let dialog: DialogHandle<"confirm" | "cancel"> | undefined;
        let manager: WindowManager | undefined;
        const [visible, setVisible] = createSignal(true);
        const dispose = render(
          () => (
            <LayerProvider>
              <WindowManagerProvider>
                <Show when={visible()}>
                  <DialogLauncher
                    onDialogCreated={(value) => (dialog = value)}
                    onWindowManager={(value) => (manager = value)}
                  />
                </Show>
              </WindowManagerProvider>
            </LayerProvider>
          ),
          container,
        );
        container.querySelector<HTMLButtonElement>("button")!.click();
        flush();
        const rejection = expect(dialog!.result).rejects.toBe(RejectReasonDialogCancelled);
        const finishDestroy = vi.spyOn(manager!, "finishDestroyWindow");
        setVisible(false);
        flush();
        expect(dialog!.exists()).toBe(false);
        expect(finishDestroy).not.toHaveBeenCalled();
        await rejection;
        await Promise.resolve();
        flush();
        expect(finishDestroy).toHaveBeenCalledOnce();
        expect(manager!.getWindows()).toHaveLength(0);
        dispose();
      },
      { scenario: "dialog-owner-reactive-disposal" },
    );
    expectNoDiagnostics(artifact);
  });

  it("emphasizes a dialog before its window has settled", async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const { dialog, dispose, windowManager } = renderDialog(false);
        const rejection = expect(dialog.result).rejects.toBe(RejectReasonDialogCancelled);
        const otherId = windowManager.createWindow({ isPinned: true });
        dialog.emphasize();
        await Promise.resolve();
        flush();

        const windows = windowManager.getWindows();
        const other = windows.find((window) => window.id === otherId)!;
        const dialogWindow = windows.find((window) => window.id !== otherId)!;
        expect(dialogWindow.zIndex()).toBeGreaterThan(other.zIndex());
        dispose();
        await rejection;
      },
      { scenario: "dialog-immediate-emphasis" },
    );
    expectNoDiagnostics(artifact);
  });

  it("cancels a dialog disposed in the same turn it is opened", async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const { dialog, dispose, windowManager } = renderDialog(false);
        const rejection = expect(dialog.result).rejects.toBe(RejectReasonDialogCancelled);

        expect(dialog.exists()).toBe(true);
        dispose();
        expect(dialog.exists()).toBe(false);
        await rejection;
        await Promise.resolve();
        flush();
        expect(windowManager.getWindows()).toHaveLength(0);
      },
      { scenario: "dialog-immediate-disposal" },
    );
    expectNoDiagnostics(artifact);
  });

  it("positions and sizes the dialog after settlement without diagnostics", async () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(75);
    try {
      const { artifact } = await captureArtifact(
        async () => {
          const { dialog, dispose, windowManager } = renderDialog();
          const rejection = expect(dialog.result).rejects.toBe(RejectReasonDialogCancelled);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          flush();

          expect(windowManager.getWindows()[0]).toMatchObject({
            size: { width: 400, height: 150 },
            isAutoPositioned: true,
            position: { x: expect.any(Number), y: expect.any(Number) },
          });
          dispose();
          await rejection;
        },
        { scenario: "dialog-settlement-placement-and-sizing" },
      );
      expectNoDiagnostics(artifact);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it("cancels outstanding dialogs and removes their windows when unmounted", async () => {
    const { dialog, dispose, windowManager } = renderDialog();
    // Attach the rejection assertion before disposal triggers the cleanup synchronously.
    const rejection = expect(dialog.result).rejects.toBe(RejectReasonDialogCancelled);

    expect(windowManager.getWindows()).toHaveLength(1);
    expect(dialog.exists()).toBe(true);
    dispose();

    await rejection;
    expect(windowManager.getWindows()).toHaveLength(0);
    expect(dialog.exists()).toBe(false);
  });

  it("rejects with the cancellation reason and closes when the titlebar close button is clicked", async () => {
    const { container, dialog, dispose } = renderDialog();
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Close window"]');

    expect(close).toBeInstanceOf(HTMLButtonElement);

    // Register the assertion first so this immediate click rejection is always observed.
    const rejection = expect(dialog.result).rejects.toBe(RejectReasonDialogCancelled);
    close!.click();

    await rejection;
    const closingWindow = container.querySelector<HTMLElement>('[x-role="window"]');
    expect(closingWindow?.dataset.windowMotion).toBe("closing");
    closingWindow?.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(container.querySelector('[x-role="window"]')).toBeNull();

    dispose();
  });

  it.each([
    ["Delete", "confirm"],
    ["Keep", "cancel"],
  ] as const)("resolves with %s when its action button is clicked", async (label, result) => {
    const { container, dialog, dispose } = renderDialog();

    // Keep the promise observation in place before the synchronous click handler settles it.
    const resolution = expect(dialog.result).resolves.toBe(result);
    button(container, label).click();

    await resolution;
    const closingWindow = container.querySelector<HTMLElement>('[x-role="window"]');
    expect(closingWindow?.dataset.windowMotion).toBe("closing");
    closingWindow?.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(container.querySelector('[x-role="window"]')).toBeNull();

    dispose();
  });
});
