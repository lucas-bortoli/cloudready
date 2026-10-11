// @vitest-environment happy-dom

import { For, onCleanup, onMount, untrack, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import WindowManager, { type WindowCloser } from "./WindowManager";
import { WindowManagerProvider, useWindowManager } from "./WindowManagerContext";
import Window from "./Window";
import useWindowCloser from "./useWindowCloser";

function TestWindow(props: {
  closer?: WindowCloser;
  content?: () => JSX.Element;
  isMinimizable?: boolean;
  isResizable?: boolean;
  onManager: (windowManager: WindowManager) => void;
}) {
  const windowManager = useWindowManager();

  onMount(() => {
    props.onManager(windowManager);
    windowManager.createWindow({
      closer: props.closer,
      content: props.content,
      isMinimizable: props.isMinimizable,
      isResizable: props.isResizable,
    });
  });

  return <For each={windowManager.getWindows()}>{(entry) => <Window entry={entry} />}</For>;
}

function renderWindow(options?: {
  closer?: WindowCloser;
  content?: () => JSX.Element;
  isMinimizable?: boolean;
  isResizable?: boolean;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  let windowManager: WindowManager | undefined;
  const dispose = render(
    () => (
      <LayerProvider>
        <WindowManagerProvider>
          <TestWindow
            closer={options?.closer}
            content={options?.content}
            isMinimizable={options?.isMinimizable}
            isResizable={options?.isResizable}
            onManager={(manager) => (windowManager = manager)}
          />
        </WindowManagerProvider>
      </LayerProvider>
    ),
    container,
  );
  const window = container.querySelector<HTMLDivElement>('[x-role="window"]');

  if (!windowManager || !window) {
    throw new Error("Window did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    window,
    windowManager,
  };
}

function closeControl(window: HTMLElement) {
  const control = window.querySelector<HTMLButtonElement>('[aria-label="Close window"]');

  if (!control) {
    throw new Error("Close control did not render.");
  }

  return control;
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 1 });
}

describe("Window", () => {
  it("focuses the window when its titlebar receives a pointer down", () => {
    const { dispose, window } = renderWindow();
    const titlebar = window.querySelector<HTMLElement>('[x-role="titlebar"]')!;

    titlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));

    expect(document.activeElement).toBe(window);

    document.dispatchEvent(pointerEvent("pointerup", 100, 100));
    dispose();
  });

  it("shows the close control only after a closer is set", () => {
    const { dispose, window, windowManager } = renderWindow();
    const windowId = windowManager.getWindows()[0].id;

    expect(window.querySelector('[aria-label="Close window"]')).toBeNull();

    windowManager.setCloser(windowId, () => false);

    expect(closeControl(window)).toBeInstanceOf(HTMLButtonElement);

    dispose();
  });

  it("shows resize handles by default and reacts to resizability changes", () => {
    const { dispose, window, windowManager } = renderWindow();
    const windowId = windowManager.getWindows()[0].id;

    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(8);

    windowManager.setResizable(windowId, false);

    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(0);

    windowManager.setResizable(windowId, true);

    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(8);

    dispose();
  });

  it("omits the minimize control when created as non-minimizable and restores it on demand", () => {
    const { dispose, window, windowManager } = renderWindow({ isMinimizable: false });
    const windowId = windowManager.getWindows()[0].id;

    expect(window.querySelector('[aria-label="Minimize window"]')).toBeNull();

    windowManager.setMinimizable(windowId, true);

    expect(window.querySelector('[aria-label="Minimize window"]')).toBeInstanceOf(
      HTMLButtonElement,
    );

    dispose();
  });

  it("omits resize handles when created as non-resizable", () => {
    const { dispose, window } = renderWindow({ isResizable: false });

    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(0);

    dispose();
  });

  it("does not expose docking controls or dock through a titlebar drag when non-resizable", () => {
    const { dispose, window, windowManager } = renderWindow({ isResizable: false });
    const titlebar = window.querySelector<HTMLElement>('[x-role="titlebar"]')!;

    expect(window.querySelector('[aria-label="Dock window left"]')).toBeNull();
    expect(window.querySelector('[aria-label="Dock window right"]')).toBeNull();
    expect(window.querySelector('[aria-label="Maximize window"]')).toBeNull();

    titlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", 0, 100));
    document.dispatchEvent(pointerEvent("pointerup", 0, 100));

    expect(windowManager.getWindows()[0].dock).toBeNull();

    dispose();
  });

  it("shows the close control for a closer supplied at creation", () => {
    const closer = vi.fn(() => false);
    const { dispose, window } = renderWindow({ closer });

    closeControl(window).click();

    expect(closer).toHaveBeenCalledOnce();

    dispose();
  });

  it("lets client content define its closer", () => {
    const closer = vi.fn(() => false);
    const { dispose, window, windowManager } = renderWindow({
      content: () => <CloserContent closer={closer} />,
    });

    closeControl(window).click();

    expect(closer).toHaveBeenCalledOnce();
    expect(windowManager.getWindows()).toHaveLength(1);

    dispose();
  });

  it("keeps the window when its closer declines the close request", () => {
    const { dispose, window, windowManager } = renderWindow();
    const closer = vi.fn(() => false);
    const windowId = windowManager.getWindows()[0].id;

    windowManager.setCloser(windowId, closer);
    closeControl(window).click();

    expect(closer).toHaveBeenCalledOnce();
    expect(windowManager.getWindows()).toHaveLength(1);
    expect(window.isConnected).toBe(true);

    dispose();
  });

  it("destroys the window and unmounts its client content when its closer approves", () => {
    const contentCleanup = vi.fn();
    const { dispose, window, windowManager } = renderWindow({
      content: () => <CleanupProbe onCleanup={contentCleanup} />,
    });
    const windowId = windowManager.getWindows()[0].id;

    windowManager.setCloser(windowId, () => true);
    closeControl(window).click();

    windowManager.finishDestroyWindow(windowId);
    expect(windowManager.getWindows()).toHaveLength(0);
    expect(window.isConnected).toBe(false);
    expect(contentCleanup).toHaveBeenCalledOnce();

    dispose();
  });

  it("uses a replacement closer and hides the control when it is cleared", () => {
    const { dispose, window, windowManager } = renderWindow();
    const firstCloser = vi.fn(() => false);
    const replacementCloser = vi.fn(() => false);
    const windowId = windowManager.getWindows()[0].id;

    windowManager.setCloser(windowId, firstCloser);
    windowManager.setCloser(windowId, replacementCloser);
    closeControl(window).click();

    expect(firstCloser).not.toHaveBeenCalled();
    expect(replacementCloser).toHaveBeenCalledOnce();

    windowManager.setCloser(windowId);

    expect(window.querySelector('[aria-label="Close window"]')).toBeNull();

    dispose();
  });
});

function CleanupProbe(props: { onCleanup: () => void }) {
  onCleanup(untrack(() => props.onCleanup));
  return <div />;
}

function CloserContent(props: { closer: () => boolean }) {
  useWindowCloser(untrack(() => props.closer));
  return <div />;
}
