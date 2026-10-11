import { createSignal, type Accessor } from "solid-js";

/** The desktop stacking groups, ordered from the backmost to the foremost. */
export type Layer =
  "background" | "windowing" | "windowing:pinned" | "shell" | "toasts" | "dragging-items";

const layers: readonly Layer[] = [
  "background",
  "windowing",
  "windowing:pinned",
  "shell",
  "toasts",
  "dragging-items",
];

/** Thrown when an operation is attempted on a released layer item. */
export class DisposedLayerItemError extends Error {
  public constructor() {
    super("The layer item has been disposed.");
    this.name = "DisposedLayerItemError";
  }
}

/** A registered item whose CSS z-index follows its current global stacking position. */
export interface LayerItem {
  /** Reactive CSS z-index for this item. */
  readonly zIndex: Accessor<number>;
  /**
   * Moves this item one position toward the back of its current layer.
   *
   * @throws {DisposedLayerItemError} When this item has been disposed.
   */
  sendBack(): void;
  /**
   * Moves this item one position toward the front of its current layer.
   *
   * @throws {DisposedLayerItemError} When this item has been disposed.
   */
  sendForward(): void;
  /**
   * Moves this item to the front of its current layer.
   *
   * @throws {DisposedLayerItemError} When this item has been disposed.
   */
  bringToTop(): void;
  /**
   * Moves this item to the back of its current layer.
   *
   * @throws {DisposedLayerItemError} When this item has been disposed.
   */
  sendToBottom(): void;
  /**
   * Moves this item to the front of another layer.
   *
   * @throws {DisposedLayerItemError} When this item has been disposed.
   */
  moveToLayer(layer: Layer): void;
  /** Removes this item from global stacking. This operation is idempotent. */
  dispose(): void;
}

interface ItemState {
  layer: Layer;
  disposed: boolean;
  setZIndex: (value: number) => number;
}

/**
 * Owns global desktop stacking order and assigns contiguous CSS z-index values.
 */
export default class LayerManager {
  private readonly itemsByLayer: Record<Layer, ItemState[]> = {
    background: [],
    windowing: [],
    "windowing:pinned": [],
    shell: [],
    toasts: [],
    "dragging-items": [],
  };

  /**
   * Creates an item at the front of the requested layer.
   *
   * @returns A handle for reading and changing the item's stacking position.
   */
  public createItem(layer: Layer): LayerItem {
    const [zIndex, setZIndex] = createSignal(0);
    const state: ItemState = { layer, disposed: false, setZIndex };
    this.itemsByLayer[layer].push(state);
    this.updateZIndexes();

    const assertActive = () => {
      if (state.disposed) throw new DisposedLayerItemError();
    };
    const reorder = (callback: (items: ItemState[], index: number) => void) => {
      assertActive();
      const items = this.itemsByLayer[state.layer];
      const index = items.indexOf(state);
      callback(items, index);
      this.updateZIndexes();
    };

    return {
      zIndex,
      sendBack: () =>
        reorder((items, index) => {
          if (index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]];
        }),
      sendForward: () =>
        reorder((items, index) => {
          if (index < items.length - 1)
            [items[index], items[index + 1]] = [items[index + 1], items[index]];
        }),
      bringToTop: () =>
        reorder((items, index) => {
          items.splice(index, 1);
          items.push(state);
        }),
      sendToBottom: () =>
        reorder((items, index) => {
          items.splice(index, 1);
          items.unshift(state);
        }),
      moveToLayer: (nextLayer) => {
        assertActive();
        if (state.layer === nextLayer) return;
        this.itemsByLayer[state.layer].splice(this.itemsByLayer[state.layer].indexOf(state), 1);
        state.layer = nextLayer;
        this.itemsByLayer[nextLayer].push(state);
        this.updateZIndexes();
      },
      dispose: () => {
        if (state.disposed) return;
        state.disposed = true;
        this.itemsByLayer[state.layer].splice(this.itemsByLayer[state.layer].indexOf(state), 1);
        this.updateZIndexes();
      },
    };
  }

  private updateZIndexes() {
    let zIndex = 0;
    for (const layer of layers) {
      for (const item of this.itemsByLayer[layer]) item.setZIndex(zIndex++);
    }
  }
}
