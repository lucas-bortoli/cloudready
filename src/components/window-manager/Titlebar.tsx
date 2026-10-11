import Close16 from "@carbon/icons/es/close/16.js";
import Maximize16 from "@carbon/icons/es/maximize/16.js";
import Minimize16 from "@carbon/icons/es/minimize/16.js";
import PinFilled16 from "@carbon/icons/es/pin--filled/16.js";
import Pin16 from "@carbon/icons/es/pin/16.js";
import SidePanelOpen16 from "@carbon/icons/es/side-panel--open/16.js";
import { Show } from "solid-js";
import CarbonIcon from "../taskbar/CarbonIcon";
import type { WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

/** Renders a window title and the controls that operate on its frame. */
export default function Titlebar(props: {
  entry: WindowEntry;
  onPointerDown: (event: PointerEvent) => void;
}) {
  const windowManager = useWindowManager();
  const handleDockLeft = () =>
    windowManager.setDock(props.entry.id, props.entry.dock === "dock-left" ? null : "dock-left");
  const handleDockRight = () =>
    windowManager.setDock(props.entry.id, props.entry.dock === "dock-right" ? null : "dock-right");

  return (
    <header
      x-role="titlebar"
      class="flex h-8 w-full shrink-0 items-center bg-neutral-600 px-1 text-neutral-50 group-focus-within/window:bg-neutral-800"
      onPointerDown={(event) => props.onPointerDown(event)}
    >
      <h1 class="ml-1">{props.entry.title}</h1>
      <div class="ml-auto inline-flex gap-0.5">
        <button
          aria-label={props.entry.isPinned ? "Unpin window" : "Pin window"}
          aria-pressed={props.entry.isPinned}
          class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => windowManager.setPinned(props.entry.id, !props.entry.isPinned)}
        >
          <CarbonIcon icon={props.entry.isPinned ? PinFilled16 : Pin16} />
        </button>
        <Show when={props.entry.isMinimizable}>
          <button
            aria-label="Minimize window"
            class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => windowManager.setMinimized(props.entry.id, true)}
          >
            <i class="pointer-events-none size-3 rounded-full border border-yellow-300 bg-yellow-400" />
          </button>
        </Show>
        <Show when={props.entry.isResizable}>
          <button
            aria-label="Dock window left"
            class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleDockLeft}
          >
            <CarbonIcon icon={SidePanelOpen16} />
          </button>
          <button
            aria-label="Dock window right"
            class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleDockRight}
          >
            <span class="scale-x-[-1]"><CarbonIcon icon={SidePanelOpen16} /></span>
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
            <i class="pointer-events-none size-3 rounded-full border border-green-300 bg-green-400" />
          </button>
        </Show>
        <Show when={props.entry.closer}>
          <button
            aria-label="Close window"
            class="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs bg-neutral-600 group-focus-within/window:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              const closer = props.entry.closer;

              if (closer?.()) windowManager.destroyWindow(props.entry.id);
            }}
          >
            <i class="pointer-events-none size-3 rounded-full border border-red-300 bg-red-400" />
          </button>
        </Show>
      </div>
    </header>
  );
}
