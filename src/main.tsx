import { render } from "solid-js/web";
import App from "./App";
import { LayerProvider } from "./components/layer-manager/LayerContext";
import { WindowManagerProvider } from "./components/window-manager/WindowManagerContext";
import "./style.css";

/** Mounts the application with its window-management context. */
render(
  () => (
    <LayerProvider>
      <WindowManagerProvider>
        <App />
      </WindowManagerProvider>
    </LayerProvider>
  ),
  document.getElementById("app")!,
);
