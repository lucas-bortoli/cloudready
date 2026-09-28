import type { JSX } from "solid-js";
import { useLayerItem } from "../layer-manager/LayerContext";
import type { WindowDock } from "./WindowManager";

const integerPixels = (value: number) => `${Math.round(value)}px`;

/** Renders the pinned viewport preview shown while a window is dragged to a dock zone. */
export default function DockPreview(props: {
  dock: Exclude<WindowDock, null>;
  taskbarHeight: number;
}) {
  const layerItem = useLayerItem("shell");

  const style = (): JSX.CSSProperties => {
    if (props.dock === "dock-full") {
      return { top: 0, right: 0, bottom: integerPixels(props.taskbarHeight), left: 0 };
    }

    if (props.dock === "dock-left") {
      return { top: 0, right: "50%", bottom: integerPixels(props.taskbarHeight), left: 0 };
    }

    return { top: 0, right: 0, bottom: integerPixels(props.taskbarHeight), left: "50%" };
  };

  return (
    <div
      x-role="dock preview"
      data-dock={props.dock}
      class="pointer-events-none fixed border-2 border-blue-500 bg-blue-500/10"
      style={{ ...style(), "z-index": layerItem.zIndex() }}
    />
  );
}
