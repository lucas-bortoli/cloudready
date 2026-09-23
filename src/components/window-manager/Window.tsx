import { createSignal, For, onCleanup, onMount } from "solid-js";
import type { WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";
import ResizeHandle, { type ResizeDirection } from "./ResizeHandle";

type ResizeAxis = -1 | 0 | 1;

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
 * position state.
 */
export default function Window(props: { entry: WindowEntry }) {
  let windowElement: HTMLDivElement | undefined;
  let clientElement: HTMLElement | undefined;
  let activePointerId: number | undefined;
  let interaction: Interaction | undefined;

  const windowManager = useWindowManager();
  const [position, setPosition] = createSignal<{ top: number; left: number }>();

  const stopInteraction = (pointerId?: number) => {
    if (!interaction || (pointerId !== undefined && interaction.pointerId !== pointerId)) {
      return;
    }

    if (windowElement) {
      setPosition({ top: windowElement.offsetTop, left: windowElement.offsetLeft });
    }

    if (interaction.type === "resize" && clientElement) {
      windowManager.setSize(props.entry.id, {
        width: clientElement.clientWidth,
        height: clientElement.clientHeight,
      });
    }

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
    stopInteraction(event.pointerId);
  };

  const startInteraction = (event: PointerEvent, nextInteraction: InteractionStart) => {
    if (activePointerId !== undefined) {
      return;
    }

    activePointerId = event.pointerId;
    interaction = { ...nextInteraction, pointerId: event.pointerId };
    document.addEventListener("pointermove", onDocumentMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
    document.addEventListener("pointercancel", onDocumentPointerUp);
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!windowElement) {
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
    if (!windowElement || !clientElement) {
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
      setPosition({
        top: Math.round(180 - windowElement.offsetHeight / 2),
        left: Math.round(220 - windowElement.offsetWidth / 2),
      });
    }
  });

  return (
    <div
      x-role="window"
      ref={windowElement}
      class="absolute z-0 box-content flex flex-col overflow-hidden rounded-lg border border-neutral-400 shadow-2xl"
      style={{
        top: integerPixels(position()?.top ?? 180 - props.entry.size.height / 2),
        left: integerPixels(position()?.left ?? 220 - props.entry.size.width / 2),
        width: integerPixels(props.entry.size.width),
        "min-width": integerPixels(props.entry.minimumSize.width),
      }}
    >
      <header
        x-role="titlebar"
        class="flex h-8 w-full shrink-0 items-center bg-amber-400 px-2 text-neutral-50"
        onPointerDown={onPointerDown}
      >
        <h1>{props.entry.title}</h1>
        <button>x</button>
      </header>
      <main
        x-role="client content container"
        ref={clientElement}
        class="w-full shrink-0 overflow-hidden bg-white"
        style={{
          height: integerPixels(props.entry.size.height),
          "min-height": integerPixels(props.entry.minimumSize.height),
        }}
        children={props.entry.content()}
      />
      <For each={resizeDirections}>
        {(direction) => <ResizeHandle direction={direction} onPointerDown={onResizePointerDown} />}
      </For>
    </div>
  );
}
