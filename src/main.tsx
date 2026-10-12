import { render } from "solid-js/web";
import { HotkeyProvider } from "./components/hotkeys/HotkeyContext";
import { LayerProvider } from "./components/layer-manager/LayerContext";
import { SessionProvider } from "./components/session/SessionContext";
import { ToastProvider } from "./components/toast/ToastContext";
import { WindowManagerProvider } from "./components/window-manager/WindowManagerContext";
import "./style.css";

/** Mounts the application with its window-management context. */
render(
  () => (
    <LayerProvider>
      <HotkeyProvider>
        <ToastProvider>
          <WindowManagerProvider>
            <SessionProvider />
          </WindowManagerProvider>
        </ToastProvider>
      </HotkeyProvider>
    </LayerProvider>
  ),
  document.getElementById("app")!,
);
