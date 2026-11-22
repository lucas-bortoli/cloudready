import { createEffect, type Accessor } from "solid-js";
import { useLayerItem } from "./LayerContext";
import type { Layer } from "./LayerManager";

/**
 * Registers an element in a desktop layer and updates its z-index as stacking changes.
 * Attach with `ref={layer(() => currentLayer)}`.
 *
 * @throws {LayerContextError} When called outside a LayerProvider.
 */
export function layer(getLayer: Accessor<Layer>): (element: HTMLElement) => void {
  const item = useLayerItem("background");
  let element: HTMLElement | undefined;

  createEffect(getLayer, (nextLayer) => item.moveToLayer(nextLayer));
  createEffect(item.zIndex, (zIndex) => {
    if (element) element.style.zIndex = String(zIndex);
  });

  return (target) => {
    element = target;
  };
}
