import { createSignal, onCleanup, onSettled, Show, untrack } from "solid-js";
import focusTrap from "../../lib/focus-trap";
import { CurrentWindowProvider } from "./CurrentWindowContext";
import DockPreview from "./DockPreview";
import ResizeHandles from "./ResizeHandles";
import Titlebar from "./Titlebar";
import useWindowInteraction from "./useWindowInteraction";
import { getFrameStyle, getWindowStyle, integerPixels } from "./window-layout";
import "./Window.css";
import type { WindowDock, WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

export interface WindowProps {
  entry: WindowEntry;
}

/** Renders one framed application window. */
export default function Window(props: WindowProps) {
  const interaction = useWindowInteraction(untrack(() => props.entry));
  const windowManager = useWindowManager();
  const handlePointerDown = () => props.entry.layerItem.bringToTop();
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!event.metaKey || !props.entry.isResizable) return;
    const dock = {
      ArrowLeft: "dock-left",
      ArrowRight: "dock-right",
      ArrowUp: "dock-full",
      ArrowDown: null,
    }[event.key];
    if (dock === undefined) return;
    event.preventDefault();
    windowManager.setDock(props.entry.id, dock as WindowDock);
  };
  const [hasOpened, setHasOpened] = createSignal(false);
  let frame: HTMLElement;
  onSettled(() => windowManager.registerFrame(props.entry.id, frame));
  onCleanup(() => windowManager.unregisterFrame(props.entry.id));

  const handleAnimationEnd = (event: AnimationEvent) => {
    if (event.target !== event.currentTarget) return;
    if (props.entry.isClosing) windowManager.finishDestroyWindow(props.entry.id);
    else setHasOpened(true);
  };

  return (
    <div
      x-role="window"
      ref={(element) => {
        interaction.setWindowElement(element);
        frame = element;
      }}
      class="group/window absolute box-content flex flex-col overflow-hidden rounded-lg border border-neutral-400 shadow-2xl outline-none"
      data-dock={props.entry.dock ?? undefined}
      data-window-id={props.entry.id}
      data-active={windowManager.activeWindowId() === props.entry.id ? "true" : undefined}
      data-window-motion={
        props.entry.isClosing
          ? "closing"
          : !props.entry.dock && props.entry.position === null && props.entry.isAutoPositioned
            ? "pending"
            : hasOpened()
              ? "idle"
              : "opening"
      }
      style={{
        ...getWindowStyle(props.entry),
        ...getFrameStyle(props.entry.dock),
        "z-index": props.entry.zIndex(),
      }}
      tabindex={-1}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onAnimationEnd={handleAnimationEnd}
    >
      <Titlebar entry={props.entry} onPointerDown={interaction.onTitlebarPointerDown} />
      <main
        x-role="client content container"
        ref={[interaction.setClientElement, focusTrap()]}
        class={[
          "relative z-0 w-full overflow-hidden bg-white text-neutral-600",
          { "min-h-0 flex-1": !!props.entry.dock, "shrink-0": !props.entry.dock },
        ]}
        style={{
          height: props.entry.dock ? undefined : integerPixels(props.entry.size.height),
          "min-height": props.entry.dock
            ? undefined
            : integerPixels(props.entry.minimumSize.height),
        }}
      >
        <CurrentWindowProvider windowId={props.entry.id}>
          {props.entry.content()}
        </CurrentWindowProvider>
      </main>
      <Show when={!props.entry.dock && props.entry.isResizable}>
        <ResizeHandles onResizePointerDown={interaction.onResizePointerDown} />
      </Show>
      <Show when={props.entry.isResizable}>
        <DockPreview dock={interaction.dockPreview} />
      </Show>
    </div>
  );
}
