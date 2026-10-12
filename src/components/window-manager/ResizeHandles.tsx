import { createMemo, For, type JSX } from "solid-js";
import type { ResizeDirection } from "./useWindowInteraction";

const resizeDirections: ResizeDirection[] = ["n", "e", "s", "w", "nw", "ne", "se", "sw"];

/**
 * An invisible pointer target placed over one edge or corner of a window frame.
 *
 * @param direction Frame edge or corner controlled by this handle.
 * @param onPointerDown Starts the owning window's resize interaction.
 */
function ResizeHandle(props: {
  direction: ResizeDirection;
  onPointerDown: (direction: ResizeDirection, event: PointerEvent) => void;
}) {
  const handlePointerDown = (event: PointerEvent) => props.onPointerDown(props.direction, event);

  const style = createMemo<JSX.CSSProperties>(() => {
    if (props.direction === "nw") {
      return {
        top: 0,
        left: 0,
        width: "16px",
        height: "16px",
        cursor: "nw-resize",
        "border-bottom-right-radius": "16px",
      };
    } else if (props.direction === "ne") {
      return {
        top: 0,
        right: 0,
        width: "16px",
        height: "16px",
        cursor: "ne-resize",
        "border-bottom-left-radius": "16px",
      };
    } else if (props.direction === "se") {
      return {
        right: 0,
        bottom: 0,
        width: "16px",
        height: "16px",
        cursor: "se-resize",
        "border-top-left-radius": "16px",
      };
    } else if (props.direction === "sw") {
      return {
        bottom: 0,
        left: 0,
        width: "16px",
        height: "16px",
        cursor: "sw-resize",
        "border-top-right-radius": "16px",
      };
    } else if (props.direction === "n") {
      return { top: 0, left: 0, right: 0, height: "8px", cursor: "n-resize" };
    } else if (props.direction === "e") {
      return { top: 0, right: 0, bottom: 0, width: "8px", cursor: "e-resize" };
    } else if (props.direction === "s") {
      return { right: 0, bottom: 0, left: 0, height: "8px", cursor: "s-resize" };
    } else {
      return { top: 0, bottom: 0, left: 0, width: "8px", cursor: "w-resize" };
    }
  });

  return (
    <div
      x-role="resize handle"
      class="absolute z-10 bg-black opacity-0 transition-opacity delay-75 hover:opacity-20"
      style={style()}
      onPointerDown={handlePointerDown}
    />
  );
}

/**
 * All eight invisible pointer target placed over the edges and corners of a window frame.
 *
 * @param onPointerDown Starts the owning window's resize interaction.
 */
export default function ResizeHandles(props: {
  onResizePointerDown: (direction: ResizeDirection, event: PointerEvent) => void;
}) {
  return (
    <For each={resizeDirections}>
      {(direction) => (
        <ResizeHandle direction={direction} onPointerDown={props.onResizePointerDown} />
      )}
    </For>
  );
}
