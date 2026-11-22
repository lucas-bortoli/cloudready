import { createEffect, onCleanup } from "solid-js";
import { cn } from "../../lib/dom";
import { useLayerManager } from "../layer-manager/LayerContext";
import { useSelection } from "./SelectionContext";

type SelectionGesture = {
  startX: number;
  startY: number;
  additive: boolean;
  items: Array<{ value: () => unknown; element: HTMLElement }>;
};

/**
 * Enables drag selection from empty space in a container.
 * Register selectable descendants with the selection item ref.
 * Ctrl/Cmd preserves existing selection; plain dragging replaces it.
 * Escape clears the selection when focus is within the boundary.
 * Arrow keys and Home/End move focus; Shift extends selection and Ctrl/Cmd moves without selecting.
 * Ctrl/Cmd+A selects all items and Ctrl/Cmd+Space toggles the focused item.
 * The ref owns the overlay and removes its listeners when Solid disposes it.
 *
 * @throws {SelectionContextError} When called outside a SelectionProvider.
 * @throws {LayerContextError} When called outside a LayerProvider.
 */
export function createSelectionBoundaryRef() {
  let element: HTMLElement;
  const options = useSelection();
  const layerItem = useLayerManager().createItem("dragging-items");
  const rangeSelectBox = document.createElement("div");
  rangeSelectBox.className = cn(
    "pointer-events-none fixed top-0 left-0 hidden border border-sky-300 bg-sky-200/50 contain-strict",
  );

  let selectionGesture: SelectionGesture | null = null;

  createEffect(
    () => layerItem.zIndex(),
    (zIndex) => {
      rangeSelectBox.style.zIndex = String(zIndex);
    },
  );

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
    if (event.defaultPrevented || !element.contains(document.activeElement)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      options.setSelectedItems(new Set());
      options.setSelectionAnchor(null);
      return;
    }

    const items = Array.from(options.items)
      .filter(([item]) => element.contains(item))
      .sort(([a], [b]) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
    if (event.altKey) return;
    const additive = event.ctrlKey || event.metaKey;
    const index = items.findIndex(([item]) => item === document.activeElement);
    if (index < 0 && document.activeElement !== element) return;
    if (additive && event.key.toLowerCase() === "a") {
      event.preventDefault();
      options.setSelectedItems(new Set(items.map(([, value]) => value())));
      return;
    }
    if (!items.length) return;
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", " "];
    if (!keys.includes(event.key) || (event.key === " " && index < 0)) return;
    event.preventDefault();

    let nextIndex = index < 0 ? 0 : index;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (index >= 0 && event.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
    else if (index >= 0 && event.key === "ArrowRight")
      nextIndex = Math.min(items.length - 1, index + 1);
    else if (index >= 0 && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const current = items[index][0].getBoundingClientRect();
      const x = current.left + current.width / 2;
      const y = current.top + current.height / 2;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const candidates = items
        .map(([item], candidateIndex) => {
          const bounds = item.getBoundingClientRect();
          return {
            index: candidateIndex,
            dy: direction * (bounds.top + bounds.height / 2 - y),
            dx: Math.abs(bounds.left + bounds.width / 2 - x),
          };
        })
        .filter((candidate) => candidate.dy > 1);
      candidates.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
      nextIndex = candidates[0]?.index ?? index;
    }

    const [nextElement, nextValue] = items[nextIndex];
    const value = nextValue();
    if (event.shiftKey) {
      let anchorIndex = items.findIndex(
        ([, itemValue]) => itemValue() === options.selectionAnchor(),
      );
      if (anchorIndex < 0) {
        anchorIndex = index < 0 ? nextIndex : index;
        options.setSelectionAnchor(items[anchorIndex][1]());
      }
      const next = additive ? new Set(options.selectedItems()) : new Set<unknown>();
      for (const [, itemValue] of items.slice(
        Math.min(anchorIndex, nextIndex),
        Math.max(anchorIndex, nextIndex) + 1,
      ))
        next.add(itemValue());
      options.setSelectedItems(next);
    } else if (!additive || event.key === " ") {
      const next = additive ? new Set(options.selectedItems()) : new Set<unknown>();
      if (additive && next.has(value)) next.delete(value);
      else next.add(value);
      options.setSelectedItems(next);
      options.setSelectionAnchor(value);
    }
    nextElement.focus();
  }

  onCleanup(() => {
    finishGesture();
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("keydown", handleKeyDown);
    rangeSelectBox.remove();
    layerItem.dispose();
  });
  return (target: HTMLElement) => {
    element = target;
    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("keydown", handleKeyDown);
  };
}

/**
 * Registers an element and its selection value with the nearest provider.
 * A context-menu request selects an unselected item and preserves an existing multi-selection.
 *
 * @throws {SelectionContextError} When called outside a SelectionProvider.
 */
export function createSelectionItemRef(value: () => unknown) {
  let element: HTMLElement;
  const selection = useSelection();

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

  onCleanup(() => {
    element.removeEventListener("click", handleClick);
    element.removeEventListener("contextmenu", handleContextMenu, true);
    selection.items.delete(element);
    if (selection.selectionAnchor() === value()) selection.setSelectionAnchor(null);
  });
  return (target: HTMLElement) => {
    element = target;
    selection.items.set(element, value);
    element.addEventListener("click", handleClick);
    // Capture runs before a context-menu handler reads the current selection.
    element.addEventListener("contextmenu", handleContextMenu, true);
  };
}
