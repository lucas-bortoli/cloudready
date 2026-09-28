import { Show, untrack } from "solid-js";
import focusTrap from "../../lib/focus-trap";
import { CurrentWindowProvider } from "./CurrentWindowContext";
import DockPreview from "./DockPreview";
import ResizeHandles from "./ResizeHandles";
import Titlebar from "./Titlebar";
import useWindowInteraction from "./useWindowInteraction";
import { getFrameStyle, getWindowStyle, integerPixels } from "./window-layout";
import type { WindowDock, WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

/** Renders one framed application window. */
export default function Window(props: { entry: WindowEntry }) {
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

  return (
    <div
      x-role="window"
      ref={interaction.setWindowElement}
      class="group/window absolute box-content flex flex-col overflow-hidden rounded-lg border border-neutral-400 shadow-2xl"
      data-dock={props.entry.dock ?? undefined}
      style={{ ...getWindowStyle(props.entry), ...getFrameStyle(props.entry.dock), "z-index": props.entry.zIndex() }}
      tabIndex={-1}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <Titlebar entry={props.entry} onPointerDown={interaction.onTitlebarPointerDown} />
      <main
        x-role="client content container"
        ref={interaction.setClientElement}
        class={`relative z-0 w-full overflow-hidden bg-white ${props.entry.dock ? "min-h-0 flex-1" : "shrink-0"}`}
        style={{
          height: props.entry.dock ? undefined : integerPixels(props.entry.size.height),
          "min-height": props.entry.dock
            ? undefined
            : integerPixels(props.entry.minimumSize.height),
        }}
        use:focusTrap={focusTrap}
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
