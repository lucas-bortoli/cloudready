import { createContext, onCleanup, onSettled, useContext, type ParentProps } from "solid-js";
import { useLayerManager } from "../layer-manager/LayerContext";
import WindowManager from "./WindowManager";

const WindowManagerContext = createContext<WindowManager | null>(null);

/**
 * Provides one {@link WindowManager} instance to a Solid component subtree.
 *
 * The manager is created once for each mounted provider.
 */
export function WindowManagerProvider(props: ParentProps) {
  const layerManager = useLayerManager();
  const windowManager = new WindowManager(layerManager);
  let stopTracking: (() => void) | undefined;
  onSettled(() => {
    stopTracking = windowManager.attachActivationTracking(document);
  });
  onCleanup(() => stopTracking?.());

  return <WindowManagerContext value={windowManager}>{props.children}</WindowManagerContext>;
}

/**
 * Returns the window manager supplied by the nearest {@link WindowManagerProvider}.
 *
 * @throws {Error} When called outside a provider.
 */
export function useWindowManager(): WindowManager {
  const windowManager = useOptionalWindowManager();

  if (!windowManager) {
    throw new Error("WindowManagerProvider is missing.");
  }

  return windowManager;
}

/**
 * Returns the nearest window manager, or undefined outside its provider.
 */
export function useOptionalWindowManager(): WindowManager | undefined {
  return useContext(WindowManagerContext) ?? undefined;
}
