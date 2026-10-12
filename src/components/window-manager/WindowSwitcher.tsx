import { createSignal, For, Show } from "solid-js";
import { useHotkey } from "../hotkeys/HotkeyContext";
import { useLayerItem } from "../layer-manager/LayerContext";
import type { WindowId, WindowState } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";
import WindowSwitchPreview from "./WindowSwitchPreview";

/** Displays and commits an Alt+Tab selection among managed windows. */
export default function WindowSwitcher() {
  const windowManager = useWindowManager();
  const layerItem = useLayerItem("shell");
  const [selectedWindowId, setSelectedWindowId] = createSignal<WindowId>();

  const switchableWindows = (): readonly WindowState[] =>
    [...windowManager.getWindows()]
      .filter((window) => !window.isClosing)
      .sort((first, second) => second.zIndex() - first.zIndex());

  const cycle = (backward: boolean) => {
    const windows = switchableWindows();
    if (windows.length < 1) return;

    const currentIndex = Math.max(
      0,
      windows.findIndex((window) => window.id === selectedWindowId()),
    );
    const nextIndex = (currentIndex + (backward ? -1 : 1) + windows.length) % windows.length;
    setSelectedWindowId(windows[nextIndex].id);
  };

  const activateSelection = () => {
    const selected = selectedWindowId();
    if (!selected) return;

    windowManager.setMinimized(selected, false);
    windowManager.bringToTop(selected);
    requestAnimationFrame(() => {
      const selectedWindow = [...document.querySelectorAll<HTMLElement>("[data-window-id]")].find(
        (element) => element.dataset.windowId === selected,
      );
      selectedWindow?.focus();
    });
    setSelectedWindowId();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !event.altKey) return false;

    cycle(event.shiftKey);
    return true;
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "Alt") return false;
    activateSelection();
    return true;
  };

  useHotkey({ eventType: "keydown", handler: handleKeyDown });
  useHotkey({ eventType: "keyup", handler: handleKeyUp });

  return (
    <>
      <WindowSwitchPreview selectedWindowId={selectedWindowId} />
      <Show when={selectedWindowId()}>
        <section
          x-role="window switcher"
          aria-label="Window switcher"
          class="pointer-events-none absolute top-1/2 left-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-neutral-600 bg-neutral-800/95 p-2 text-neutral-100 shadow-2xl"
          style={{ "z-index": layerItem.zIndex() }}
        >
          <For each={switchableWindows()}>
            {(window) => (
              <div
                class="truncate rounded-xs px-3 py-2"
                classList={{ "bg-sky-600": window.id === selectedWindowId() }}
              >
                {window.title}
              </div>
            )}
          </For>
        </section>
      </Show>
    </>
  );
}
