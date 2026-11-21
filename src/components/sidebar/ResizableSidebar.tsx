import { createSignal, onCleanup, onMount } from "solid-js";
import { cn } from "../../lib/dom";
import FixedSidebar, { type FixedSidebarProps } from "./FixedSidebar";

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const MIN_CONTENT_WIDTH = 240;
const KEYBOARD_STEP = 10;

export interface ResizableSidebarProps extends FixedSidebarProps {
  class?: string;
  asideClass?: string;
  "data-show"?: boolean;
  sizeKey?: string;
}

/** A sidebar with a draggable, keyboard-accessible width divider. */
export default function ResizableSidebar(props: ResizableSidebarProps) {
  const [width, setWidth] = createSignal(200);
  const [availableWidth, setAvailableWidth] = createSignal(Infinity);
  let container: HTMLDivElement | undefined;
  let drag: { pointerId: number; startX: number; startWidth: number } | undefined;

  const maxWidth = () =>
    Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, availableWidth() - MIN_CONTENT_WIDTH));
  const effectiveWidth = () => Math.min(width(), maxWidth());
  const resize = (value: number) => setWidth(Math.max(MIN_WIDTH, Math.min(maxWidth(), value)));

  const saveWidth = () => {
    if (!props.sizeKey) return;
    try {
      localStorage.setItem(props.sizeKey, String(width()));
    } catch {
      // Storage may be unavailable or full; resizing still works for this session.
    }
  };

  onMount(() => {
    if (props.sizeKey) {
      try {
        const stored = localStorage.getItem(props.sizeKey);
        const value = stored === null || stored.trim() === "" ? NaN : Number(stored);
        if (Number.isFinite(value)) setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value)));
      } catch {
        // Use the default width when storage is unavailable.
      }
    }
    const parent = container?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(parent);
    onCleanup(() => observer.disconnect());
  });

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: effectiveWidth() };
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) resize(drag.startWidth + event.clientX - drag.startX);
  };
  const handlePointerEnd = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      drag = undefined;
      saveWidth();
    }
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") resize(effectiveWidth() - KEYBOARD_STEP);
    else if (event.key === "ArrowRight") resize(effectiveWidth() + KEYBOARD_STEP);
    else if (event.key === "Home") resize(MIN_WIDTH);
    else if (event.key === "End") resize(maxWidth());
    else return;
    event.preventDefault();
    saveWidth();
  };

  return (
    <div
      ref={container}
      class={cn("relative flex h-full shrink-0", props.class)}
      style={{ width: `${effectiveWidth()}px` }}
    >
      <FixedSidebar
        class={props.asideClass ?? "flex h-full"}
        selectedItem={props.selectedItem}
        setSelectedItem={props.setSelectedItem}
        fill
      >
        {props.children}
      </FixedSidebar>
      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth()}
        aria-valuenow={effectiveWidth()}
        tabIndex={0}
        class="absolute inset-y-0 -right-0.5 z-10 hidden w-1 cursor-col-resize touch-none outline-sky-300 hover:bg-sky-300/50 focus:bg-sky-300/50 focus:outline-2 focus:outline-offset-2 @min-[600px]:block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
