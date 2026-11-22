import { createEffect, createSignal, onCleanup, onSettled, Show, type Accessor } from "solid-js";
import { Portal } from "@solidjs/web";
import { useLayerItem } from "../layer-manager/LayerContext";
import type { WindowId } from "./WindowManager";

interface WindowBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Draws a layer-managed outline around the window selected in the switcher. */
export interface WindowSwitchPreviewProps {
  selectedWindowId: Accessor<WindowId | undefined>;
}

export default function WindowSwitchPreview(props: WindowSwitchPreviewProps) {
  const layerItem = useLayerItem("windowing:pinned");
  const [bounds, setBounds] = createSignal<WindowBounds>();

  const updateBounds = (selectedWindowId: WindowId | undefined) => {
    const selectedWindow = [...document.querySelectorAll<HTMLElement>("[data-window-id]")].find(
      (element) => element.dataset.windowId === selectedWindowId,
    );
    if (!selectedWindow || selectedWindow.offsetParent === null) {
      setBounds();
      return;
    }

    const rect = selectedWindow.getBoundingClientRect();
    setBounds({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
  };

  const handleResize = () => updateBounds(props.selectedWindowId());

  createEffect(() => props.selectedWindowId(), updateBounds);
  onSettled(() => window.addEventListener("resize", handleResize));
  onCleanup(() => window.removeEventListener("resize", handleResize));

  return (
    <Show when={bounds()}>
      {(previewBounds) => (
        <Portal>
          <div
            x-role="window switch preview"
            class="pointer-events-none fixed border-2 border-sky-400 bg-sky-400/10"
            style={{
              top: `${previewBounds().top}px`,
              right: `${window.innerWidth - previewBounds().right}px`,
              bottom: `${window.innerHeight - previewBounds().bottom}px`,
              left: `${previewBounds().left}px`,
              "z-index": layerItem.zIndex(),
            }}
          />
        </Portal>
      )}
    </Show>
  );
}
