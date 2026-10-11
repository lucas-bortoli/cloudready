import { Show, type Accessor, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import type { WindowDock } from "./WindowManager";
import { integerPixels, taskbarHeight } from "./window-layout";

/** Returns the viewport layout styles for a visible dock preview. */
function getDockPreviewStyle(dock: Exclude<WindowDock, null>): JSX.CSSProperties {
  if (dock === "dock-full") {
    return { top: 0, right: 0, bottom: integerPixels(taskbarHeight), left: 0 };
  }

  if (dock === "dock-left") {
    return { top: 0, right: "50%", bottom: integerPixels(taskbarHeight), left: 0 };
  }

  return { top: 0, right: 0, bottom: integerPixels(taskbarHeight), left: "50%" };
}

/** Renders the viewport overlay that previews the current dock target. */
export default function DockPreview(props: { dock: Accessor<WindowDock> }) {
  return (
    <Show when={props.dock()}>
      {(dock) => (
        <Portal>
          <div
            x-role="dock preview"
            data-dock={dock()}
            class="pointer-events-none fixed z-10 border-2 border-blue-500 bg-blue-500/10"
            style={getDockPreviewStyle(dock())}
          />
        </Portal>
      )}
    </Show>
  );
}
