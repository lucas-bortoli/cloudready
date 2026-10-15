// @vitest-environment happy-dom

import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import WindowManager from "./WindowManager";
import { WindowManagerProvider, useWindowManager } from "./WindowManagerContext";
import WindowsOutlet from "./WindowsOutlet";

const HANDLE_DIRECTIONS = ["n", "e", "s", "w", "nw", "ne", "se", "sw"] as const;

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
const originalOffsetLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft");

function pixels(value: string) {
  return Number.parseInt(value, 10) || 0;
}

function restoreDescriptor(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, name, descriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, name);
  }
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 1 });
}

function windowControl(window: HTMLElement, label: string) {
  const control = window.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

  if (!control) {
    throw new Error(`Window control ${label} did not render.`);
  }

  return control;
}

function TestDesktop(props: {
  onManager: (windowManager: WindowManager) => void;
  windowCount?: number;
}) {
  const windowManager = useWindowManager();

  onMount(() => {
    props.onManager(windowManager);
    for (let index = 0; index < (props.windowCount ?? 1); index += 1) {
      windowManager.createWindow({
        size: { width: 400, height: 300 },
        minimumSize: { width: 200, height: 150 },
      });
    }
  });

  return <WindowsOutlet />;
}

function renderWindow(windowCount = 1) {
  const container = document.createElement("div");
  document.body.append(container);
  let windowManager: WindowManager | undefined;
  const dispose = render(
    () => (
      <LayerProvider>
        <WindowManagerProvider>
          <TestDesktop
            onManager={(manager) => (windowManager = manager)}
            windowCount={windowCount}
          />
        </WindowManagerProvider>
      </LayerProvider>
    ),
    container,
  );
  const window = container.querySelector<HTMLDivElement>('[x-role="window"]');
  const client = container.querySelector<HTMLElement>('[x-role="client content container"]');

  if (!windowManager || !window || !client) {
    throw new Error("Window did not render.");
  }

  return {
    client,
    dispose: () => {
      dispose();
      container.remove();
    },
    window,
    windowManager,
  };
}

describe("WindowsOutlet", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        const element = this as HTMLElement;

        if (element.getAttribute("x-role") === "client content container") {
          return pixels(element.parentElement?.style.width ?? "");
        }

        return originalClientWidth?.get?.call(element) ?? 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        const element = this as HTMLElement;

        if (element.getAttribute("x-role") === "client content container") {
          return pixels(element.style.height);
        }

        return originalClientHeight?.get?.call(element) ?? 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        const element = this as HTMLElement;

        if (element.getAttribute("x-role") === "window") {
          return pixels(element.style.width) + 2;
        }

        return originalOffsetWidth?.get?.call(element) ?? 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        const element = this as HTMLElement;

        if (element.getAttribute("x-role") === "window") {
          return (
            pixels(
              element.querySelector<HTMLElement>('[x-role="client content container"]')?.style
                .height ?? "",
            ) + 34
          );
        }

        return originalOffsetHeight?.get?.call(element) ?? 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get() {
        return pixels((this as HTMLElement).style.top);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
      configurable: true,
      get() {
        return pixels((this as HTMLElement).style.left);
      },
    });
  });

  afterAll(() => {
    restoreDescriptor("clientWidth", originalClientWidth);
    restoreDescriptor("clientHeight", originalClientHeight);
    restoreDescriptor("offsetWidth", originalOffsetWidth);
    restoreDescriptor("offsetHeight", originalOffsetHeight);
    restoreDescriptor("offsetTop", originalOffsetTop);
    restoreDescriptor("offsetLeft", originalOffsetLeft);
  });

  it("creates and updates manager-owned presentation state", () => {
    const windowManager = new WindowManager();
    const windowId = windowManager.createWindow();

    expect(windowManager.getWindows()[0]).toMatchObject({
      position: null,
      dock: null,
      isMinimized: false,
      isPinned: false,
    });

    windowManager.setPosition(windowId, { x: 40, y: 20 });
    windowManager.setDock(windowId, "dock-right");
    windowManager.setMinimized(windowId, true);

    expect(windowManager.getWindows()[0]).toMatchObject({
      position: { x: 40, y: 20 },
      dock: "dock-right",
      isMinimized: true,
    });
  });

  it("accepts initial presentation state when creating a window", () => {
    const windowManager = new WindowManager();

    windowManager.createWindow({
      position: { x: 40, y: 20 },
      dock: "dock-left",
      isMinimized: true,
      isPinned: true,
    });

    expect(windowManager.getWindows()[0]).toMatchObject({
      position: { x: 40, y: 20 },
      dock: "dock-left",
      isMinimized: true,
      isPinned: true,
    });
  });

  it("keeps pinned windows above ordinary windows and supports changing pin state", () => {
    const { dispose, windowManager } = renderWindow(2);
    const windows = document.querySelectorAll<HTMLDivElement>('[x-role="window"]');
    const zIndexes = () => [...windows].map((element) => Number(element.style.zIndex));
    const [, pinned] = windowManager.getWindows();

    windowManager.setPinned(pinned.id, true);
    expect(zIndexes()[1]).toBeGreaterThan(zIndexes()[0]);

    windowManager.setPinned(pinned.id, false);
    expect(zIndexes()[0]).toBeLessThan(zIndexes()[1]);
    dispose();
  });

  it("keeps a closing pinned window until motion completes", () => {
    const { dispose, windowManager } = renderWindow(2);
    const [first, second] = windowManager.getWindows();
    windowManager.setPinned(second.id, true);
    expect(second.zIndex()).toBeGreaterThan(first.zIndex());
    expect(windowManager.destroyWindow(first.id)).toBe(true);
    expect(first.isClosing).toBe(true);
    expect(windowManager.destroyWindow(first.id)).toBe(false);
    windowManager.finishDestroyWindow(first.id);
    expect(windowManager.getWindows()).toHaveLength(1);
    dispose();
  });

  it("keeps automatic placement until an explicit position is set", () => {
    const windowManager = new WindowManager();
    const windowId = windowManager.createWindow();

    expect(windowManager.getWindows()[0].isAutoPositioned).toBe(true);
    windowManager.setAutoPosition(windowId, { x: 100, y: 80 });
    expect(windowManager.getWindows()[0].position).toEqual({ x: 100, y: 80 });

    windowManager.setPosition(windowId, { x: 30, y: 20 });
    windowManager.setAutoPosition(windowId, { x: 200, y: 160 });
    expect(windowManager.getWindows()[0].position).toEqual({ x: 30, y: 20 });

    windowManager.setPosition(windowId, null);
    windowManager.setAutoPosition(windowId, { x: 200, y: 160 });
    expect(windowManager.getWindows()[0].position).toEqual({ x: 200, y: 160 });
  });

  it("centers a rendered window and stops recentering after a drag", () => {
    const { dispose, window, windowManager } = renderWindow();
    const entry = windowManager.getWindows()[0];
    expect(entry.position).toEqual({
      x: Math.round((globalThis.window.innerWidth - window.offsetWidth) / 2),
      y: Math.max(
        48 + 12,
        Math.round(48 + (globalThis.window.innerHeight - 48 - window.offsetHeight) / 2),
      ),
    });
    expect(window.dataset.windowMotion).toBe("opening");

    window
      .querySelector<HTMLElement>('[x-role="titlebar"]')!
      .dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointerup", 110, 110));
    expect(entry.isAutoPositioned).toBe(false);
    dispose();
  });

  it("removes a closing rendered window after its animation", () => {
    const { dispose, window, windowManager } = renderWindow();
    const id = windowManager.getWindows()[0].id;
    expect(windowManager.destroyWindow(id)).toBe(true);
    expect(window.dataset.windowMotion).toBe("closing");
    window.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(windowManager.getWindows()).toHaveLength(0);
    dispose();
  });

  it("removes immediately when reduced motion is requested", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    try {
      const windowManager = new WindowManager();
      const id = windowManager.createWindow();
      expect(windowManager.destroyWindow(id)).toBe(true);
      expect(windowManager.getWindows()).toHaveLength(0);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps a minimizing frame visible until motion finishes and restores it", () => {
    const { dispose, window, windowManager } = renderWindow();
    const id = windowManager.getWindows()[0].id;
    const taskbarButton = document.createElement("button");
    taskbarButton.dataset.windowTaskbarId = id;
    document.body.append(taskbarButton);
    const animations: Array<{ onfinish: (() => void) | null; cancel: () => void }> = [];
    const originalAnimate = window.animate;
    window.animate = (() => {
      const animation = { onfinish: null, cancel: () => undefined };
      animations.push(animation);
      return animation as unknown as Animation;
    }) as typeof window.animate;
    try {
      windowManager.setMinimized(id, true);
      expect(window.style.display).not.toBe("none");
      expect(windowManager.motion.isMinimizing(id)).toBe(true);
      animations[0].onfinish?.();
      expect(window.style.display).toBe("none");

      windowManager.setMinimized(id, false);
      expect(window.style.display).not.toBe("none");
      expect(animations).toHaveLength(2);
      animations[1].onfinish?.();
      expect(windowManager.getWindows()[0].isMinimized).toBe(false);
    } finally {
      window.animate = originalAnimate;
      taskbarButton.remove();
      dispose();
    }
  });

  it("morphs a docked frame and skips the morph when dragging it away", async () => {
    const { dispose, window, windowManager } = renderWindow();
    const id = windowManager.getWindows()[0].id;
    const keyframes: Keyframe[][] = [];
    const originalAnimate = window.animate;
    const originalRect = window.getBoundingClientRect;
    window.getBoundingClientRect = (() => ({
      left: pixels(window.style.left),
      top: pixels(window.style.top),
      width: window.dataset.dock ? 500 : 402,
      height: window.dataset.dock ? 700 : 334,
    })) as typeof window.getBoundingClientRect;
    window.animate = ((frames: Keyframe[]) => {
      keyframes.push(frames);
      return { onfinish: null, cancel: () => undefined } as unknown as Animation;
    }) as typeof window.animate;
    try {
      windowManager.setDock(id, "dock-left");
      await Promise.resolve();
      expect(keyframes).toHaveLength(1);
      expect(keyframes[0][0].transform).toContain("scale(");

      windowManager.motion.suppressNextDockAnimation(id);
      windowManager.setDock(id, null);
      await Promise.resolve();
      expect(keyframes).toHaveLength(1);
    } finally {
      window.animate = originalAnimate;
      window.getBoundingClientRect = originalRect;
      dispose();
    }
  });

  it("changes minimize and dock state immediately with reduced motion", async () => {
    const { dispose, window, windowManager } = renderWindow();
    const id = windowManager.getWindows()[0].id;
    const originalMatchMedia = globalThis.window.matchMedia;
    const originalAnimate = window.animate;
    let calls = 0;
    globalThis.window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    window.animate = (() => {
      calls += 1;
      return { cancel: () => undefined } as unknown as Animation;
    }) as typeof window.animate;
    try {
      windowManager.setMinimized(id, true);
      expect(window.style.display).toBe("none");
      windowManager.setMinimized(id, false);
      windowManager.setDock(id, "dock-full");
      await Promise.resolve();
      expect(window.style.display).not.toBe("none");
      expect(windowManager.getWindows()[0].dock).toBe("dock-full");
      expect(calls).toBe(0);
    } finally {
      globalThis.window.matchMedia = originalMatchMedia;
      window.animate = originalAnimate;
      dispose();
    }
  });

  it("uses the requested size for the client area, excluding the frame", () => {
    const { client, dispose, window } = renderWindow();

    expect(client.clientWidth).toBe(400);
    expect(client.clientHeight).toBe(300);
    expect(window.offsetWidth).toBeGreaterThan(client.clientWidth);
    expect(window.offsetHeight).toBeGreaterThan(client.clientHeight);

    dispose();
  });

  it("brings a window to the front when its titlebar interaction begins", () => {
    const { dispose } = renderWindow(2);
    const windows = document.querySelectorAll<HTMLDivElement>('[x-role="window"]');
    const firstTitlebar = windows[0].querySelector<HTMLElement>('[x-role="titlebar"]')!;
    const zIndexes = () => [...windows].map((element) => Number(element.style.zIndex));

    expect(zIndexes()[1]).toBeGreaterThan(zIndexes()[0]);
    firstTitlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));

    expect(zIndexes()[0]).toBeGreaterThan(zIndexes()[1]);
    document.dispatchEvent(pointerEvent("pointerup", 100, 100));
    dispose();
  });

  it("keeps pinned windows above ordinary windows", () => {
    const { dispose, windowManager } = renderWindow(2);
    const windows = document.querySelectorAll<HTMLDivElement>('[x-role="window"]');
    const secondTitlebar = windows[1].querySelector<HTMLElement>('[x-role="titlebar"]')!;
    const zIndexes = () => [...windows].map((element) => Number(element.style.zIndex));

    windowManager.setPinned(windowManager.getWindows()[0].id, true);
    secondTitlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));

    expect(zIndexes()[0]).toBeGreaterThan(zIndexes()[1]);
    document.dispatchEvent(pointerEvent("pointerup", 100, 100));
    dispose();
  });

  it.each(HANDLE_DIRECTIONS)("persists client dimensions when resizing from %s", (direction) => {
    const { dispose, window, windowManager } = renderWindow();
    const handle = window.querySelectorAll<HTMLElement>('[x-role="resize handle"]')[
      HANDLE_DIRECTIONS.indexOf(direction)
    ];
    const horizontalDelta = direction.includes("e") ? 20 : direction.includes("w") ? -20 : 0;
    const verticalDelta = direction.includes("s") ? 20 : direction.includes("n") ? -20 : 0;

    handle.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", 100 + horizontalDelta, 100 + verticalDelta));
    document.dispatchEvent(pointerEvent("pointerup", 100 + horizontalDelta, 100 + verticalDelta));

    expect(windowManager.getWindows()[0].size).toEqual({
      width: horizontalDelta === 0 ? 400 : 420,
      height: verticalDelta === 0 ? 300 : 320,
    });

    dispose();
  });

  it.each(["e", "nw"] as const)(
    "keeps an auto-placed window anchored while resizing from %s",
    (direction) => {
      const { dispose, window, windowManager } = renderWindow();
      const entry = windowManager.getWindows()[0];
      const start = { ...entry.position! };
      const handle = window.querySelectorAll<HTMLElement>('[x-role="resize handle"]')[
        HANDLE_DIRECTIONS.indexOf(direction)
      ];

      handle.dispatchEvent(pointerEvent("pointerdown", 100, 100));
      expect(entry.isAutoPositioned).toBe(false);
      document.dispatchEvent(pointerEvent("pointermove", 120, 120));
      globalThis.window.dispatchEvent(new Event("resize"));

      expect(entry.position).toEqual(start);
      expect(window.offsetLeft).toBe(start.x + (direction === "nw" ? 20 : 0));
      document.dispatchEvent(pointerEvent("pointerup", 120, 120));
      expect(entry.position).toEqual({ x: window.offsetLeft, y: window.offsetTop });
      dispose();
    },
  );

  it("clamps the resized client area to its client minimum", () => {
    const { dispose, window, windowManager } = renderWindow();
    const eastHandle = window.querySelectorAll<HTMLElement>('[x-role="resize handle"]')[1];
    const southHandle = window.querySelectorAll<HTMLElement>('[x-role="resize handle"]')[2];

    eastHandle.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", -500, 100));
    document.dispatchEvent(pointerEvent("pointerup", -500, 100));
    southHandle.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", 100, -500));
    document.dispatchEvent(pointerEvent("pointerup", 100, -500));

    expect(windowManager.getWindows()[0].size).toEqual({ width: 200, height: 150 });

    dispose();
  });

  it("minimizes locally without changing the managed client size", () => {
    const { dispose, window, windowManager } = renderWindow();

    windowControl(window, "Minimize window").click();

    expect(window.style.display).toBe("none");
    expect(windowManager.getWindows()[0]).toMatchObject({
      size: { width: 400, height: 300 },
      isMinimized: true,
    });

    dispose();
  });

  it.each([
    ["Dock window left", "50%", "0px", "dock-left"],
    ["Dock window right", "0px", "50%", "dock-right"],
    ["Maximize window", "0px", "0px", "dock-full"],
  ])("docks through %s without changing the managed client size", (label, right, left, dock) => {
    const { client, dispose, window, windowManager } = renderWindow();

    windowControl(window, label).click();

    expect(window.style.top).toBe("48px");
    expect(window.style.right).toBe(right);
    expect(window.style.bottom).toBe("0px");
    expect(window.style.left).toBe(left);
    expect(window.dataset.dock).toBe(dock);
    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(0);
    expect(client.classList).toContain("flex-1");
    expect(client.style.height).toBe("");
    expect(client.style.minHeight).toBe("");
    expect(windowManager.getWindows()[0]).toMatchObject({
      size: { width: 400, height: 300 },
      dock,
    });

    dispose();
  });

  it("toggles a dock control back to its floating presentation", () => {
    const { dispose, window, windowManager } = renderWindow();
    const dockLeft = windowControl(window, "Dock window left");

    dockLeft.click();
    dockLeft.click();

    expect(window.style.width).toBe("400px");
    expect(window.classList).toContain("box-content");
    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(8);
    expect(windowManager.getWindows()[0].dock).toBeNull();

    dispose();
  });

  it("docks when a titlebar drag ends at a viewport edge", () => {
    const { dispose, window, windowManager } = renderWindow();
    const titlebar = window.querySelector<HTMLElement>('[x-role="titlebar"]')!;

    titlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", 0, 100));

    const preview = document.querySelector<HTMLElement>('[x-role="dock preview"]');
    expect(preview?.dataset.dock).toBe("dock-left");
    expect(preview?.style.right).toBe("50%");

    document.dispatchEvent(pointerEvent("pointerup", 0, 100));

    expect(window.style.right).toBe("50%");
    expect(window.style.top).toBe("48px");
    expect(window.style.bottom).toBe("0px");
    expect(document.querySelector('[x-role="dock preview"]')).toBeNull();
    expect(windowManager.getWindows()[0]).toMatchObject({
      size: { width: 400, height: 300 },
      dock: "dock-left",
    });

    dispose();
  });

  it.each([
    [12, 48],
    [window.innerWidth - 12, 48],
  ])("docks full-screen when a titlebar drag ends at top corner (%i, %i)", (x, y) => {
    const { dispose, window, windowManager } = renderWindow();
    const titlebar = window.querySelector<HTMLElement>('[x-role="titlebar"]')!;

    titlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", x, y));
    document.dispatchEvent(pointerEvent("pointerup", x, y));

    expect(windowManager.getWindows()[0].dock).toBe("dock-full");

    dispose();
  });

  it.each([
    ["dock-left", 12, 100],
    ["dock-right", window.innerWidth - 12, 100],
  ])("docks %s when a titlebar drag ends in its edge zone", (dock, x, y) => {
    const { dispose, window, windowManager } = renderWindow();
    const titlebar = window.querySelector<HTMLElement>('[x-role="titlebar"]')!;

    titlebar.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    document.dispatchEvent(pointerEvent("pointermove", x, y));
    document.dispatchEvent(pointerEvent("pointerup", x, y));

    expect(windowManager.getWindows()[0].dock).toBe(dock);

    dispose();
  });

  it("restores a docked window to floating when its titlebar is dragged away", () => {
    const { dispose, window, windowManager } = renderWindow();
    const titlebar = window.querySelector<HTMLElement>('[x-role="titlebar"]')!;

    windowControl(window, "Dock window left").click();
    titlebar.dispatchEvent(pointerEvent("pointerdown", 10, 20));

    expect(window.style.top).toBe("4px");
    expect(window.style.left).toBe("-190px");

    document.dispatchEvent(pointerEvent("pointerup", 200, 200));

    expect(window.style.width).toBe("400px");
    expect(window.querySelectorAll('[x-role="resize handle"]')).toHaveLength(8);
    expect(windowManager.getWindows()[0].dock).toBeNull();

    dispose();
  });
});
