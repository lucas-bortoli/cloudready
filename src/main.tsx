import { render } from "solid-js/web";
import App from "./App";
import { WindowManagerProvider } from "./components/window-manager/WindowManagerContext";
import "./style.css";

/** Mounts the application with its window-management context. */
render(
  () => (
    <WindowManagerProvider>
      <App />
    </WindowManagerProvider>
  ),
  document.getElementById("app")!,
);
