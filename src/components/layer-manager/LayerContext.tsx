import { createContext, onCleanup, useContext, type ParentProps } from "solid-js";
import LayerManager, { type Layer, type LayerItem } from "./LayerManager";

const LayerContext = createContext<LayerManager>();

/** Provides one global stacking manager to a Solid component subtree. */
export function LayerProvider(props: ParentProps) {
  const layerManager = new LayerManager();

  return <LayerContext.Provider value={layerManager}>{props.children}</LayerContext.Provider>;
}

/**
 * Returns the stacking manager supplied by the nearest {@link LayerProvider}.
 *
 * @throws {LayerContextError} When called outside a provider.
 */
export function useLayerManager(): LayerManager {
  const layerManager = useContext(LayerContext);
  if (!layerManager) throw new LayerContextError();
  return layerManager;
}

/** Thrown when a layer hook is used without a surrounding {@link LayerProvider}. */
export class LayerContextError extends Error {
  public constructor() {
    super("LayerProvider is missing.");
    this.name = "LayerContextError";
  }
}

/**
 * Registers one component-owned stacking item and releases it on unmount.
 *
 * @throws {LayerContextError} When called outside a provider.
 */
export function useLayerItem(layer: Layer): LayerItem {
  const item = useLayerManager().createItem(layer);
  onCleanup(() => item.dispose());
  return item;
}
