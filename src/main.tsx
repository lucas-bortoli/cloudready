import { render } from "solid-js/web";
import { LayerProvider } from "./components/layer-manager/LayerContext";
import { SessionProvider } from "./components/session/SessionContext";
import { WindowManagerProvider } from "./components/window-manager/WindowManagerContext";
import "./style.css";

/** Mounts the application with its window-management context. */
render(
  () => (
    <LayerProvider>
      <WindowManagerProvider>
        <SessionProvider />
      </WindowManagerProvider>
    </LayerProvider>
  ),
  document.getElementById("app")!,
);
