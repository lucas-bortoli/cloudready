// @vitest-environment jsdom

import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import WindowManager from "./WindowManager";
import { WindowManagerProvider, useWindowManager } from "./WindowManagerContext";
import WindowOutlet from "./WindowOutlet";

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

function TestDesktop(props: { onManager: (windowManager: WindowManager) => void }) {
  const windowManager = useWindowManager();

  onMount(() => {
    props.onManager(windowManager);
    windowManager.createWindow({
      size: { width: 400, height: 300 },
      minimumSize: { width: 200, height: 150 },
    });
  });

  return <WindowOutlet />;
}

function renderWindow() {
  const container = document.createElement("div");
  document.body.append(container);
  let windowManager: WindowManager | undefined;
  const dispose = render(
    () => (
      <WindowManagerProvider>
        <TestDesktop onManager={(manager) => (windowManager = manager)} />
      </WindowManagerProvider>
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

describe("WindowOutlet", () => {
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

  it("uses the requested size for the client area, excluding the frame", () => {
    const { client, dispose, window } = renderWindow();

    expect(client.clientWidth).toBe(400);
    expect(client.clientHeight).toBe(300);
    expect(window.offsetWidth).toBeGreaterThan(client.clientWidth);
    expect(window.offsetHeight).toBeGreaterThan(client.clientHeight);

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
});
