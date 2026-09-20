import { createContext, useContext, type ParentProps } from "solid-js";
import WindowManager from "./WindowManager";

const WindowManagerContext = createContext<WindowManager>();

export function WindowManagerProvider(props: ParentProps) {
  const windowManager = new WindowManager();

  return (
    <WindowManagerContext.Provider value={windowManager}>
      {props.children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager(): WindowManager {
  const windowManager = useContext(WindowManagerContext);

  if (!windowManager) {
    throw new Error("WindowManagerProvider is missing.");
  }

  return windowManager;
}
