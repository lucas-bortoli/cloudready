import Apps16 from "@carbon/icons/es/apps/16.js";
import { createSignal, For, Show } from "solid-js";
import { useLayerItem } from "../layer-manager/LayerContext";
import type { WindowId } from "../window-manager/WindowManager";
import { useWindowManager } from "../window-manager/WindowManagerContext";
import CarbonIcon from "./CarbonIcon";
import Clock from "./Clock";
import StartMenu from "./StartMenu";

interface TaskbarProps {
  onLaunchFiles: () => void;
}

export default function Taskbar(props: TaskbarProps) {
  const layerItem = useLayerItem("shell");
  const [isStartMenuOpen, setIsStartMenuOpen] = createSignal(false);

  const windowManager = useWindowManager();

  const handleWindowButton = (windowId: WindowId) => {
    const window = windowManager.getWindows().find((w) => w.id === windowId);
    if (!window) return;

    if (window.isMinimized) {
      windowManager.setMinimized(windowId, false);
      windowManager.bringToTop(windowId);
    } else {
      windowManager.bringToTop(windowId);
    }
  };

  return (
    <section
      x-role="taskbar"
      class="absolute right-0 bottom-0 left-0 flex h-12 items-center bg-neutral-800 p-1 text-neutral-100"
      style={{ "z-index": layerItem.zIndex() }}
    >
      <button
        aria-controls="start-menu"
        aria-expanded={isStartMenuOpen()}
        class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-neutral-800 px-3 transition-colors hover:bg-neutral-700"
        type="button"
        onClick={() => setIsStartMenuOpen(!isStartMenuOpen())}
      >
        <span class="grid size-4 shrink-0 place-items-center">
          <CarbonIcon icon={Apps16} />
        </span>
        Apps
      </button>
      <section x-role="window list">
        <For
          each={windowManager.getWindows()}
          children={(window) => (
            <button
              class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-neutral-800 px-3 transition-colors hover:bg-neutral-700"
              onClick={handleWindowButton.bind(null, window.id)}
            >
              {window.title}
            </button>
          )}
        />
      </section>
      <Clock />
      <Show when={isStartMenuOpen()}>
        <StartMenu onClose={() => setIsStartMenuOpen(false)} onLaunchFiles={props.onLaunchFiles} />
      </Show>
    </section>
  );
}
