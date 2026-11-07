import { createEffect, type Accessor } from "solid-js";
import { useLayerItem } from "./LayerContext";
import type { Layer } from "./LayerManager";

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      layer: Layer;
    }
    interface DirectiveFunctions {
      layer: typeof layer;
    }
  }
}

/**
 * Registers an element in a desktop layer and updates its z-index as stacking changes.
 *
 * @throws {LayerContextError} When called outside a LayerProvider.
 */
export function layer(element: HTMLElement, getLayer: Accessor<Layer>): void {
  const item = useLayerItem(getLayer());
  createEffect(() => {
    item.moveToLayer(getLayer());
    element.style.zIndex = String(item.zIndex());
  });
}
