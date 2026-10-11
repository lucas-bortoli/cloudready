import { render } from "solid-js/web";
import App from "./App";
import { WindowManagerProvider } from "./components/window-manager/WindowManagerContext";
import { SessionProvider } from "./session/SessionContext";
import "./style.css";

/** Mounts the application with its window-management context. */
render(
  () => (
    <WindowManagerProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </WindowManagerProvider>
  ),
  document.getElementById("app")!,
);
