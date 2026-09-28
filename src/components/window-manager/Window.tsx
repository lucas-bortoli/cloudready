import Close16 from "@carbon/icons/es/close/16.js";
import Maximize16 from "@carbon/icons/es/maximize/16.js";
import Minimize16 from "@carbon/icons/es/minimize/16.js";
import SidePanelOpen16 from "@carbon/icons/es/side-panel--open/16.js";
import { batch, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import focusTrap from "../../lib/focus-trap";
import CarbonIcon from "../taskbar/CarbonIcon";
import ResizeHandle, { type ResizeDirection } from "./ResizeHandle";
import type { WindowDock, WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

type ResizeAxis = -1 | 0 | 1;
const taskbarHeight = 48;
const dockActivationDistance = 24;

/** Maps each resize handle to its horizontal and vertical growth directions. */
const resizeAxes = {
  nw: { horizontalDirection: -1, verticalDirection: -1 },
  n: { horizontalDirection: 0, verticalDirection: -1 },
  ne: { horizontalDirection: 1, verticalDirection: -1 },
  e: { horizontalDirection: 1, verticalDirection: 0 },
  se: { horizontalDirection: 1, verticalDirection: 1 },
  s: { horizontalDirection: 0, verticalDirection: 1 },
  sw: { horizontalDirection: -1, verticalDirection: 1 },
  w: { horizontalDirection: -1, verticalDirection: 0 },
} as const satisfies Record<
  ResizeDirection,
  { horizontalDirection: ResizeAxis; verticalDirection: ResizeAxis }
>;

const resizeDirections = ["n", "e", "s", "w", "nw", "ne", "se", "sw"] as const;

/** Converts a layout measurement to an integer CSS pixel value. */
const integerPixels = (value: number) => `${Math.round(value)}px`;

interface PointerInteraction {
  pointerId: number;
  startX: number;
  startY: number;
  startTop: number;
  startLeft: number;
}

interface DragInteraction extends PointerInteraction {
  type: "drag";
}

interface ResizeInteraction extends PointerInteraction {
  type: "resize";
  horizontalDirection: ResizeAxis;
  verticalDirection: ResizeAxis;
  startWidth: number;
  startHeight: number;
}

type Interaction = DragInteraction | ResizeInteraction;
type InteractionStart = Omit<DragInteraction, "pointerId"> | Omit<ResizeInteraction, "pointerId">;

/**
 * Renders one framed application window and owns its local drag, resize, and
 * pointer-interaction state.
 */
export default function Window(props: { entry: WindowEntry }) {
  let windowElement: HTMLDivElement | undefined;
  let clientElement: HTMLElement | undefined;
  let activePointerId: number | undefined;
  let interaction: Interaction | undefined;

  const windowManager = useWindowManager();
  const [dockPreview, setDockPreview] = createSignal<WindowDock>(null);
  const dockAtPointer = (event: PointerEvent): WindowDock => {
    if (event.clientY <= dockActivationDistance) return "dock-full";
    if (event.clientX <= dockActivationDistance) return "dock-left";
    if (event.clientX >= window.innerWidth - dockActivationDistance) return "dock-right";
    return null;
  };

  const windowStyle = (): JSX.CSSProperties => {
    const dock = props.entry.dock;

    if (dock === "dock-full") {
      return {
        top: 0,
        right: 0,
        bottom: integerPixels(taskbarHeight),
        left: 0,
        display: props.entry.isMinimized ? "none" : undefined,
      };
    }

    if (dock === "dock-left") {
      return {
        top: 0,
        right: "50%",
        bottom: integerPixels(taskbarHeight),
        left: 0,
        display: props.entry.isMinimized ? "none" : undefined,
      };
    }

    if (dock === "dock-right") {
      return {
        top: 0,
        right: 0,
        bottom: integerPixels(taskbarHeight),
        left: "50%",
        display: props.entry.isMinimized ? "none" : undefined,
      };
    }

    return {
      top: integerPixels(props.entry.position?.y ?? 12),
      left: integerPixels(props.entry.position?.x ?? 12),
      width: integerPixels(props.entry.size.width),
      "min-width": integerPixels(props.entry.minimumSize.width),
      display: props.entry.isMinimized ? "none" : undefined,
    };
  };

  const dockPreviewStyle = (): JSX.CSSProperties => {
    if (dockPreview() === "dock-full") {
      return { top: 0, right: 0, bottom: integerPixels(taskbarHeight), left: 0 };
    }

    if (dockPreview() === "dock-left") {
      return { top: 0, right: "50%", bottom: integerPixels(taskbarHeight), left: 0 };
    }

    return { top: 0, right: 0, bottom: integerPixels(taskbarHeight), left: "50%" };
  };

  const frameStyle = (): JSX.CSSProperties => {
    if (props.entry.dock === "dock-full") {
      return {
        "box-sizing": "border-box",
        "border-top-width": 0,
        "border-right-width": 0,
        "border-left-width": 0,
        "border-top-left-radius": 0,
        "border-top-right-radius": 0,
      };
    }

    if (props.entry.dock === "dock-left") {
      return {
        "box-sizing": "border-box",
        "border-top-width": 0,
        "border-left-width": 0,
        "border-top-left-radius": 0,
      };
    }

    if (props.entry.dock === "dock-right") {
      return {
        "box-sizing": "border-box",
        "border-top-width": 0,
        "border-right-width": 0,
        "border-top-right-radius": 0,
      };
    }

    return {};
  };

  const stopInteraction = (event?: PointerEvent) => {
    if (!interaction || (event && interaction.pointerId !== event.pointerId)) {
      return;
    }

    const dock = interaction.type === "drag" && event ? dockAtPointer(event) : null;
    const resizedClientSize =
      interaction.type === "resize" && clientElement
        ? { width: clientElement.clientWidth, height: clientElement.clientHeight }
        : undefined;

    if (dock) {
      windowManager.setDock(props.entry.id, dock);
    } else if (windowElement) {
      windowManager.setPosition(props.entry.id, {
        x: windowElement.offsetLeft,
        y: windowElement.offsetTop,
      });
    }

    if (resizedClientSize) {
      windowManager.setSize(props.entry.id, resizedClientSize);
    }

    setDockPreview(null);

    document.removeEventListener("pointermove", onDocumentMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerUp);
    activePointerId = undefined;
    interaction = undefined;
  };

  const onDocumentMove = (event: PointerEvent) => {
    const element = windowElement;

    if (!interaction || !element || event.pointerId !== interaction.pointerId) {
      return;
    }

    if (interaction.type === "drag") {
      setDockPreview(dockAtPointer(event));
      element.style.top = integerPixels(interaction.startTop + event.clientY - interaction.startY);
      element.style.left = integerPixels(
        interaction.startLeft + event.clientX - interaction.startX,
      );
      return;
    }

    const width = Math.max(
      Math.ceil(props.entry.minimumSize.width),
      Math.round(
        interaction.startWidth +
          interaction.horizontalDirection * (event.clientX - interaction.startX),
      ),
    );
    const height = Math.max(
      Math.ceil(props.entry.minimumSize.height),
      Math.round(
        interaction.startHeight +
          interaction.verticalDirection * (event.clientY - interaction.startY),
      ),
    );

    element.style.width = integerPixels(width);
    clientElement?.style.setProperty("height", integerPixels(height));

    if (interaction.horizontalDirection < 0) {
      element.style.left = integerPixels(interaction.startLeft + interaction.startWidth - width);
    }

    if (interaction.verticalDirection < 0) {
      element.style.top = integerPixels(interaction.startTop + interaction.startHeight - height);
    }
  };

  const onDocumentPointerUp = (event: PointerEvent) => {
    stopInteraction(event);
  };

  const startInteraction = (event: PointerEvent, nextInteraction: InteractionStart) => {
    if (activePointerId !== undefined) {
      return;
    }

    activePointerId = event.pointerId;
    interaction = { ...nextInteraction, pointerId: event.pointerId };
    setDockPreview(null);
    document.addEventListener("pointermove", onDocumentMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
    document.addEventListener("pointercancel", onDocumentPointerUp);
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!windowElement) {
      return;
    }

    if (props.entry.dock) {
      const position = {
        x: event.clientX - Math.round(props.entry.size.width / 2),
        y: event.clientY - 16,
      };

      batch(() => {
        windowManager.setPosition(props.entry.id, position);
        windowManager.setDock(props.entry.id, null);
      });
      startInteraction(event, {
        type: "drag",
        startX: event.clientX,
        startY: event.clientY,
        startTop: position.y,
        startLeft: position.x,
      });
      return;
    }

    startInteraction(event, {
      type: "drag",
      startX: event.clientX,
      startY: event.clientY,
      startTop: windowElement.offsetTop,
      startLeft: windowElement.offsetLeft,
    });
  };

  const onResizePointerDown = (direction: ResizeDirection, event: PointerEvent) => {
    if (props.entry.dock || !windowElement || !clientElement) {
      return;
    }

    startInteraction(event, {
      type: "resize",
      ...resizeAxes[direction],
      startX: event.clientX,
      startY: event.clientY,
      startTop: windowElement.offsetTop,
      startLeft: windowElement.offsetLeft,
      startWidth: clientElement.clientWidth,
      startHeight: clientElement.clientHeight,
    });
  };

  onCleanup(() => stopInteraction());

  onMount(() => {
    if (windowElement) {
      const edgePadding = 12;
      const usableHeight = window.innerHeight - 48;
      if (props.entry.position === null) {
        windowManager.setPosition(props.entry.id, {
          y: Math.max(edgePadding, Math.round((usableHeight - windowElement.offsetHeight) / 2)),
          x: Math.max(edgePadding, Math.round((window.innerWidth - windowElement.offsetWidth) / 2)),
        });
      }
    }
  });

  return (
    <>
      <div
        x-role="window"
        ref={windowElement}
        class="group/window absolute z-0 box-content flex flex-col overflow-hidden rounded-lg border border-neutral-400 shadow-2xl"
        data-dock={props.entry.dock ?? undefined}
        style={{ ...windowStyle(), ...frameStyle() }}
        tabIndex={-1}
      >
        <header
          x-role="titlebar"
          class="flex h-8 w-full shrink-0 items-center bg-neutral-600 px-1 text-neutral-50 group-focus-within/window:bg-neutral-800"
          onPointerDown={onPointerDown}
        >
          <h1 class="ml-1">{props.entry.title}</h1>
          <div class="ml-auto inline-flex gap-0.5">
            <button
              aria-label="Minimize window"
              class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => windowManager.setMinimized(props.entry.id, true)}
            >
              <CarbonIcon icon={Minimize16} />
            </button>
            <button
              aria-label="Dock window left"
              class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                windowManager.setDock(
                  props.entry.id,
                  props.entry.dock === "dock-left" ? null : "dock-left",
                )
              }
            >
              <CarbonIcon icon={SidePanelOpen16} />
            </button>
            <button
              aria-label="Dock window right"
              class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                windowManager.setDock(
                  props.entry.id,
                  props.entry.dock === "dock-right" ? null : "dock-right",
                )
              }
            >
              <span class="scale-x-[-1]">
                <CarbonIcon icon={SidePanelOpen16} />
              </span>
            </button>
            <button
              aria-label="Maximize window"
              class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                windowManager.setDock(
                  props.entry.id,
                  props.entry.dock === "dock-full" ? null : "dock-full",
                )
              }
            >
              <CarbonIcon icon={Maximize16} />
            </button>
            <button
              class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <CarbonIcon icon={Close16} />
            </button>
          </div>
        </header>
        <main
          x-role="client content container"
          ref={clientElement}
          class={`relative z-0 w-full overflow-hidden bg-white ${props.entry.dock ? "min-h-0 flex-1" : "shrink-0"}`}
          style={{
            height: props.entry.dock ? undefined : integerPixels(props.entry.size.height),
            "min-height": props.entry.dock
              ? undefined
              : integerPixels(props.entry.minimumSize.height),
          }}
          children={props.entry.content()}
          use:focusTrap={focusTrap}
        />
        <Show when={!props.entry.dock}>
          <For each={resizeDirections}>
            {(direction) => (
              <ResizeHandle direction={direction} onPointerDown={onResizePointerDown} />
            )}
          </For>
        </Show>
      </div>
      <Show when={dockPreview()}>
        <div
          x-role="dock preview"
          data-dock={dockPreview()}
          class="pointer-events-none fixed z-10 border-2 border-blue-500 bg-blue-500/10"
          style={dockPreviewStyle()}
        />
      </Show>
    </>
  );
}
