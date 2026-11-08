import { createEffect, onCleanup } from "solid-js";
import { cn } from "../../lib/dom";
import { useLayerManager } from "../layer-manager/LayerContext";
import { useSelection } from "./SelectionContext";

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      selectionBoundary: boolean;
      selectionItem: unknown;
    }
    interface DirectiveFunctions {
      selectionBoundary: typeof selectionBoundary;
      selectionItem: typeof selectionItem;
    }
  }
}

type SelectionGesture = {
  startX: number;
  startY: number;
  additive: boolean;
  items: Array<{ value: () => unknown; element: HTMLElement }>;
};

/**
 * Enables drag selection from empty space in a container.
 * Register selectable descendants with the selectionItem directive.
 * Ctrl/Cmd preserves existing selection; plain dragging replaces it.
 * Escape clears the selection when focus is within the boundary.
 * The directive owns the overlay and removes its listeners when Solid disposes it.
 *
 * @throws {SelectionContextError} When called outside a SelectionProvider.
 * @throws {LayerContextError} When called outside a LayerProvider.
 */
export function selectionBoundary(element: HTMLElement): void {
  const options = useSelection();
  const layerItem = useLayerManager().createItem("dragging-items");
  const rangeSelectBox = document.createElement("div");
  rangeSelectBox.className = cn(
    "pointer-events-none fixed top-0 left-0 hidden border border-sky-300 bg-sky-200/50 contain-strict",
  );

  let selectionGesture: SelectionGesture | null = null;

  createEffect(() => {
    rangeSelectBox.style.zIndex = String(layerItem.zIndex());
  });

  function handlePointerMove(event: PointerEvent) {
    if (!selectionGesture) return;

    // Normalize viewport coordinates so dragging left or upward still gives positive dimensions.
    const left = Math.min(selectionGesture.startX, event.clientX);
    const top = Math.min(selectionGesture.startY, event.clientY);
    const right = Math.max(selectionGesture.startX, event.clientX);
    const bottom = Math.max(selectionGesture.startY, event.clientY);
    rangeSelectBox.style.transform = `translate(${left}px, ${top}px)`;
    rangeSelectBox.style.width = `${right - left}px`;
    rangeSelectBox.style.height = `${bottom - top}px`;

    // Compare viewport rectangles so the overlay and entries share one coordinate space.
    const box = rangeSelectBox.getBoundingClientRect();
    const next = selectionGesture.additive ? new Set(options.selectedItems()) : new Set<unknown>();
    for (const item of selectionGesture.items) {
      const itemBounds = item.element.getBoundingClientRect();
      if (
        itemBounds.left < box.right &&
        itemBounds.right > box.left &&
        itemBounds.top < box.bottom &&
        itemBounds.bottom > box.top
      ) {
        next.add(item.value());
      }
    }
    options.setSelectedItems(next);
  }

  function finishGesture() {
    if (!selectionGesture) return;

    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerup", finishGesture);
    element.removeEventListener("pointercancel", finishGesture);
    rangeSelectBox.classList.add("hidden");
    rangeSelectBox.remove();
    selectionGesture = null;
  }

  function handlePointerDown(event: PointerEvent) {
    // Entry presses belong to the entry's click handler, rather than starting a marquee.
    if (selectionGesture || event.target !== element || event.button !== 0) return;

    // Continue receiving moves and the release even when the pointer leaves the list.
    element.setPointerCapture(event.pointerId);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", finishGesture);
    element.addEventListener("pointercancel", finishGesture);
    selectionGesture = {
      startX: event.clientX,
      startY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      items: Array.from(options.items, ([itemElement, value]) => ({
        element: itemElement,
        value,
      })).filter((item) => element.contains(item.element)),
    };
    if (!selectionGesture.additive) options.setSelectedItems(new Set());
    options.setSelectionAnchor(null);
    // Keep the overlay outside the scrollable list so it cannot expand its scroll area.
    document.body.append(rangeSelectBox);
    rangeSelectBox.classList.remove("hidden");
    handlePointerMove(event);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      !element.contains(document.activeElement)
    )
      return;
    event.preventDefault();
    options.setSelectedItems(new Set());
    options.setSelectionAnchor(null);
  }

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("keydown", handleKeyDown);
  onCleanup(() => {
    finishGesture();
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("keydown", handleKeyDown);
    rangeSelectBox.remove();
    layerItem.dispose();
  });
}

/**
 * Registers an element and its selection value with the nearest provider.
 * A context-menu request selects an unselected item and preserves an existing multi-selection.
 *
 * @throws {SelectionContextError} When called outside a SelectionProvider.
 */
export function selectionItem(element: HTMLElement, value: () => unknown): void {
  const selection = useSelection();
  selection.items.set(element, value);

  function handleClick(event: MouseEvent) {
    const current = value();
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      const items = Array.from(selection.items).sort(([a], [b]) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      const anchorIndex = items.findIndex(
        ([, itemValue]) => itemValue() === selection.selectionAnchor(),
      );
      const index = items.findIndex(([item]) => item === element);
      if (anchorIndex >= 0 && index >= 0) {
        const next = additive ? new Set(selection.selectedItems()) : new Set<unknown>();
        for (const [, itemValue] of items.slice(
          Math.min(anchorIndex, index),
          Math.max(anchorIndex, index) + 1,
        )) {
          next.add(itemValue());
        }
        selection.setSelectedItems(next);
        return;
      }
    }
    const next =
      additive && !event.shiftKey ? new Set(selection.selectedItems()) : new Set<unknown>();
    if (additive && !event.shiftKey && next.has(current)) next.delete(current);
    else next.add(current);
    selection.setSelectedItems(next);
    selection.setSelectionAnchor(current);
  }

  function handleContextMenu(event: MouseEvent) {
    if (event.target !== element || event.defaultPrevented) return;
    const current = value();
    if (!selection.selectedItems().has(current)) {
      selection.setSelectedItems(new Set([current]));
      selection.setSelectionAnchor(current);
    }
  }

  element.addEventListener("click", handleClick);
  // Capture runs before a context-menu directive reads the current selection.
  element.addEventListener("contextmenu", handleContextMenu, true);
  onCleanup(() => {
    element.removeEventListener("click", handleClick);
    element.removeEventListener("contextmenu", handleContextMenu, true);
    selection.items.delete(element);
    if (selection.selectionAnchor() === value()) selection.setSelectionAnchor(null);
  });
}
