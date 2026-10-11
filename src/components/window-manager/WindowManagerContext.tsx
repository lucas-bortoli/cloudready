import { createContext, useContext, type ParentProps } from "solid-js";
import { LayerContextError, useLayerManager } from "../layer-manager/LayerContext";
import WindowManager from "./WindowManager";

const WindowManagerContext = createContext<WindowManager>();

/**
 * Provides one {@link WindowManager} instance to a Solid component subtree.
 *
 * The manager is created once for each mounted provider.
 */
export function WindowManagerProvider(props: ParentProps) {
  const layerManager = useLayerManager();
  const windowManager = new WindowManager(layerManager);

  return (
    <WindowManagerContext.Provider value={windowManager}>
      {props.children}
    </WindowManagerContext.Provider>
  );
}

/**
 * Returns the window manager supplied by the nearest {@link WindowManagerProvider}.
 *
 * @throws {Error} When called outside a provider.
 */
export function useWindowManager(): WindowManager {
  const windowManager = useContext(WindowManagerContext);

  if (!windowManager) {
    throw new Error("WindowManagerProvider is missing.");
  }

  return windowManager;
}
