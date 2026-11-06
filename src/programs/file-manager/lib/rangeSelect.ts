import { onCleanup } from "solid-js";

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      rangeSelect: RangeSelectOptions;
    }
    interface DirectiveFunctions {
      rangeSelect: typeof rangeSelect;
    }
  }
}

type RangeSelectOptions = {
  selectedItems: () => ReadonlySet<string>;
  setSelectedItems: (items: ReadonlySet<string>) => void;
  setSelectionAnchor: (name: string | null) => void;
};

type SelectionGesture = {
  startX: number;
  startY: number;
  additive: boolean;
  items: Array<{ name: string; element: HTMLElement }>;
};

/**
 * Enables drag selection from empty space in a positioned, scrollable list.
 * Options must have `role="option"` and a `data-entry-name` selection key.
 * Ctrl/Cmd preserves existing selection; plain dragging replaces it.
 * The directive owns the overlay and removes its listeners when Solid disposes it.
 */
export default function rangeSelect(
  element: HTMLOListElement,
  getOptions: () => RangeSelectOptions,
): void {
  const options = getOptions();
  const rangeSelectBox = document.createElement("div");
  rangeSelectBox.className =
    "pointer-events-none absolute top-0 left-0 hidden border border-sky-300 bg-sky-200/50";

  let selectionGesture: SelectionGesture | null = null;

  function handlePointerMove(event: PointerEvent) {
    if (!selectionGesture) return;

    const bounds = element.getBoundingClientRect();
    // Keep the drag origin and current point in scrollable content coordinates.
    const currentX = event.clientX - bounds.left + element.scrollLeft;
    const currentY = event.clientY - bounds.top + element.scrollTop;
    // Normalize the corners so dragging left or upward still produces positive dimensions.
    const left = Math.min(selectionGesture.startX, currentX);
    const top = Math.min(selectionGesture.startY, currentY);
    const right = Math.max(selectionGesture.startX, currentX);
    const bottom = Math.max(selectionGesture.startY, currentY);
    rangeSelectBox.style.transform = `translate(${left}px, ${top}px)`;
    rangeSelectBox.style.width = `${right - left}px`;
    rangeSelectBox.style.height = `${bottom - top}px`;

    // Compare viewport rectangles so the overlay and entries share one coordinate space.
    const box = rangeSelectBox.getBoundingClientRect();
    const next = selectionGesture.additive ? new Set(options.selectedItems()) : new Set<string>();
    for (const item of selectionGesture.items) {
      const itemBounds = item.element.getBoundingClientRect();
      if (
        itemBounds.left < box.right &&
        itemBounds.right > box.left &&
        itemBounds.top < box.bottom &&
        itemBounds.bottom > box.top
      ) {
        next.add(item.name);
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
    const bounds = element.getBoundingClientRect();
    selectionGesture = {
      startX: event.clientX - bounds.left + element.scrollLeft,
      startY: event.clientY - bounds.top + element.scrollTop,
      additive: event.ctrlKey || event.metaKey,
      // Query once per gesture. Entry elements must stay stable as selection changes.
      items: Array.from(element.querySelectorAll<HTMLElement>("[role='option']")).flatMap(
        (itemElement) => {
          const name = itemElement.dataset.entryName;
          return name ? [{ name, element: itemElement }] : [];
        },
      ),
    };
    if (!selectionGesture.additive) options.setSelectedItems(new Set());
    options.setSelectionAnchor(null);
    // Solid owns the list's dynamic children; attach the overlay only for the gesture.
    element.append(rangeSelectBox);
    rangeSelectBox.classList.remove("hidden");
    handlePointerMove(event);
  }

  element.addEventListener("pointerdown", handlePointerDown);
  onCleanup(() => {
    finishGesture();
    element.removeEventListener("pointerdown", handlePointerDown);
    rangeSelectBox.remove();
  });
}
