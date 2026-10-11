import { batch, createSignal, onCleanup, onMount } from "solid-js";
import { integerPixels } from "./window-layout";
import type { WindowDock, WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

/** A window edge or corner that can initiate a resize interaction. */
export type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type ResizeAxis = -1 | 0 | 1;
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

/** Owns a window's drag, resize, dock-preview, and pointer-listener lifecycle. */
export default function useWindowInteraction(entry: WindowEntry) {
  let windowElement: HTMLDivElement | undefined;
  let clientElement: HTMLElement | undefined;
  let activePointerId: number | undefined;
  let interaction: Interaction | undefined;

  const windowManager = useWindowManager();
  const [dockPreview, setDockPreview] = createSignal<WindowDock>(null);

  const dockAtPointer = (event: PointerEvent): WindowDock => {
    if (!entry.isResizable) return null;
    if (event.clientY <= dockActivationDistance) return "dock-full";
    if (event.clientX <= dockActivationDistance) return "dock-left";
    if (event.clientX >= window.innerWidth - dockActivationDistance) return "dock-right";
    return null;
  };

  const removeDocumentListeners = () => {
    document.removeEventListener("pointermove", onDocumentMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerUp);
  };

  const resetInteraction = () => {
    setDockPreview(null);
    removeDocumentListeners();
    activePointerId = undefined;
    interaction = undefined;
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
      windowManager.setDock(entry.id, dock);
    } else if (windowElement) {
      windowManager.setPosition(entry.id, {
        x: windowElement.offsetLeft,
        y: windowElement.offsetTop,
      });
    }

    if (resizedClientSize) {
      windowManager.setSize(entry.id, resizedClientSize);
    }

    resetInteraction();
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
      Math.ceil(entry.minimumSize.width),
      Math.round(
        interaction.startWidth +
          interaction.horizontalDirection * (event.clientX - interaction.startX),
      ),
    );
    const height = Math.max(
      Math.ceil(entry.minimumSize.height),
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

  const onTitlebarPointerDown = (event: PointerEvent) => {
    if (!windowElement) {
      return;
    }

    windowElement.focus();

    if (entry.dock) {
      if (!entry.isResizable) return;

      const position = {
        x: event.clientX - Math.round(entry.size.width / 2),
        y: event.clientY - 16,
      };

      batch(() => {
        windowManager.setPosition(entry.id, position);
        windowManager.setDock(entry.id, null);
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
    if (!entry.isResizable || entry.dock || !windowElement || !clientElement) {
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
    if (!windowElement || entry.position !== null) {
      return;
    }

    const edgePadding = 12;
    const usableHeight = window.innerHeight - 48;
    windowManager.setPosition(entry.id, {
      y: Math.max(edgePadding, Math.round((usableHeight - windowElement.offsetHeight) / 2)),
      x: Math.max(edgePadding, Math.round((window.innerWidth - windowElement.offsetWidth) / 2)),
    });
  });

  return {
    dockPreview,
    onResizePointerDown,
    onTitlebarPointerDown,
    setClientElement: (element: HTMLElement) => (clientElement = element),
    setWindowElement: (element: HTMLDivElement) => (windowElement = element),
  };
}
