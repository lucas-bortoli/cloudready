// @vitest-environment happy-dom

import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import WindowManager from "../window-manager/WindowManager";
import { WindowManagerProvider, useWindowManager } from "../window-manager/WindowManagerContext";
import WindowsOutlet from "../window-manager/WindowsOutlet";
import useDialog, { RejectReasonDialogCancelled } from "./Dialog";

/** Props supplied to the fixture that opens one dialog after mounting. */
interface DialogLauncherProps {
  /** Receives the promise returned by the fixture's dialog. */
  onDialogCreated: (dialog: Promise<"confirm" | "cancel">) => void;
  /** Receives the manager that owns the fixture's dialog window. */
  onWindowManager: (windowManager: WindowManager) => void;
}

/** Opens a representative dialog and renders the manager's window outlet. */
function DialogLauncher(props: DialogLauncherProps) {
  const createDialog = useDialog();
  const windowManager = useWindowManager();

  onMount(() => {
    props.onWindowManager(windowManager);
    props.onDialogCreated(
      createDialog({
        title: "Delete document",
        content: () => <p>Delete this document?</p>,
        actions: { confirm: "Delete", cancel: "Keep" },
      }),
    );
  });

  return <WindowsOutlet />;
}

/** Mounts a dialog fixture and returns its promise, manager, and DOM cleanup function. */
function renderDialog() {
  const container = document.createElement("div");
  document.body.append(container);
  let dialog: Promise<"confirm" | "cancel"> | undefined;
  let windowManager: WindowManager | undefined;
  const dispose = render(
    () => (
      <WindowManagerProvider>
        <DialogLauncher
          onDialogCreated={(createdDialog) => (dialog = createdDialog)}
          onWindowManager={(manager) => (windowManager = manager)}
        />
      </WindowManagerProvider>
    ),
    container,
  );

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
  it("cancels outstanding dialogs and removes their windows when unmounted", async () => {
    const { dialog, dispose, windowManager } = renderDialog();
    // Attach the rejection assertion before disposal triggers the cleanup synchronously.
    const rejection = expect(dialog).rejects.toBe(RejectReasonDialogCancelled);

    expect(windowManager.getWindows()).toHaveLength(1);
    dispose();

    await rejection;
    expect(windowManager.getWindows()).toHaveLength(0);
  });

  it("rejects with the cancellation reason and closes when the titlebar close button is clicked", async () => {
    const { container, dialog, dispose } = renderDialog();
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Close window"]');

    expect(close).toBeInstanceOf(HTMLButtonElement);

    // Register the assertion first so this immediate click rejection is always observed.
    const rejection = expect(dialog).rejects.toBe(RejectReasonDialogCancelled);
    close!.click();

    await rejection;
    expect(container.querySelector('[x-role="window"]')).toBeNull();

    dispose();
  });

  it.each([
    ["Delete", "confirm"],
    ["Keep", "cancel"],
  ] as const)("resolves with %s when its action button is clicked", async (label, result) => {
    const { container, dialog, dispose } = renderDialog();

    // Keep the promise observation in place before the synchronous click handler settles it.
    const resolution = expect(dialog).resolves.toBe(result);
    button(container, label).click();

    await resolution;
    expect(container.querySelector('[x-role="window"]')).toBeNull();

    dispose();
  });
});
