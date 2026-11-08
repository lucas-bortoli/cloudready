import { For, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import { SelectionProvider } from "./SelectionContext";
import { selectionBoundary, selectionItem } from "./rangeSelect";

void selectionBoundary;
void selectionItem;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

function pointer(
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
  options: PointerEventInit = {},
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
      ...options,
    }),
  );
}

function setup(initialSelection: string[] = [], scrollTop = 0) {
  const [entries, setEntries] = createSignal<string[]>([]);
  const [selectedItems, setSelectedItems] = createSignal<ReadonlySet<string>>(
    new Set(initialSelection),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(
    () => (
      <LayerProvider>
        <SelectionProvider selectedItems={selectedItems} setSelectedItems={setSelectedItems}>
          <ol use:selectionBoundary>
            <For each={entries()}>
              {(name) => (
                <li
                  role="option"
                  data-entry-name={name}
                  use:selectionItem={name}
                  aria-selected={selectedItems().has(name)}
                >
                  {name}
                </li>
              )}
            </For>
          </ol>
        </SelectionProvider>
      </LayerProvider>
    ),
    container,
  );
  cleanups.push(() => {
    dispose();
    container.remove();
  });
  const list = container.querySelector("ol")!;
  list.scrollTop = scrollTop;
  const capture = vi.fn();
  list.setPointerCapture = capture;

  // happy-dom has no layout engine. Supply viewport bounds for the list, entries,
  // and the overlay, translating the overlay's actual styles into its rectangle.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === list) return new DOMRect(100, 50, 300, 300);
    if (this.dataset.entryName) {
      const index = entries().indexOf(this.dataset.entryName);
      return new DOMRect(120 + index * 60, 70 - list.scrollTop, 40, 40);
    }
    if (this.parentElement === document.body && this.classList.contains("pointer-events-none")) {
      const [x, y] = this.style.transform.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      return new DOMRect(x, y, parseFloat(this.style.width), parseFloat(this.style.height));
    }
    return new DOMRect();
  });

  // Populate after mounting to exercise Solid's dynamic list insertion.
  setEntries(["first", "second", "third"]);
  return { list, selectedItems, capture, dispose, setEntries };
}

describe("rangeSelect", () => {
  it("navigates entries and extends a range from the keyboard", () => {
    const { list, selectedItems } = setup();
    const entries = list.querySelectorAll<HTMLElement>("li");
    entries.forEach((entry) => {
      entry.tabIndex = -1;
    });
    list.tabIndex = 0;
    list.focus();
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(entries[0]);
    expect([...selectedItems()]).toEqual(["first"]);
    entries[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(entries[1]);
    expect([...selectedItems()]).toEqual(["first", "second"]);
    entries[1].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(entries[2]);
    expect([...selectedItems()]).toEqual(["first", "second"]);
    entries[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect([...selectedItems()]).toEqual(["first", "second", "third"]);
    entries[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(entries[0]);
    expect([...selectedItems()]).toEqual(["first"]);
    entries[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect([...selectedItems()]).toEqual(["first", "second", "third"]);
  });

  it("moves vertically to the closest entry in the next row", () => {
    const { list } = setup();
    const entries = list.querySelectorAll<HTMLElement>("li");
    entries.forEach((entry) => {
      entry.tabIndex = -1;
    });
    Object.defineProperty(entries[0], "getBoundingClientRect", {
      value: () => new DOMRect(0, 0, 40, 40),
    });
    Object.defineProperty(entries[1], "getBoundingClientRect", {
      value: () => new DOMRect(50, 0, 40, 40),
    });
    Object.defineProperty(entries[2], "getBoundingClientRect", {
      value: () => new DOMRect(0, 50, 40, 40),
    });
    entries[1].focus();
    entries[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(entries[2]);
    entries[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(entries[0]);
  });

  it.each(["boundary", "item"])(
    "clears selection and its anchor on Escape from a focused %s",
    (focus) => {
      const { list, selectedItems } = setup();
      const entries = list.querySelectorAll("li");
      entries[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const target = focus === "boundary" ? list : entries[1];
      target.tabIndex = 0;
      target.focus();
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(selectedItems().size).toBe(0);
      entries[2].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
      expect([...selectedItems()]).toEqual(["third"]);
    },
  );

  it("selects an unselected context-menu target and preserves an existing selection", () => {
    const { list, selectedItems } = setup(["first", "second"]);
    const entries = list.querySelectorAll("li");
    entries[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect([...selectedItems()]).toEqual(["first", "second"]);
    entries[2].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect([...selectedItems()]).toEqual(["third"]);
    entries[0].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect([...selectedItems()]).toEqual(["first", "second", "third"]);
  });

  it.each([
    [110, 60, 170, 120],
    [170, 120, 110, 60],
    [170, 60, 110, 120],
    [110, 120, 170, 60],
  ])("selects overlapping entries dragging from (%s, %s) to (%s, %s)", (x1, y1, x2, y2) => {
    const { list, selectedItems, capture } = setup(["third"]);
    const entry = list.querySelector("li");
    pointer(list, "pointerdown", x1, y1);
    pointer(list, "pointermove", x2, y2);
    expect([...selectedItems()]).toEqual(["first"]);
    expect(capture).toHaveBeenCalledWith(1);
    expect(document.body.querySelector(".pointer-events-none")).not.toBeNull();
    expect(list.querySelector("li")).toBe(entry);
    expect(entry?.getAttribute("aria-selected")).toBe("true");
    // Selection keeps updating after the first reactive state change.
    pointer(list, "pointermove", 230, y1 === 120 ? 60 : 120);
    expect(selectedItems().has("second")).toBe(true);
  });

  it.each(["ctrlKey", "metaKey"])("preserves existing selection with %s", (modifier) => {
    const { list, selectedItems } = setup(["third"]);
    pointer(list, "pointerdown", 110, 60, { [modifier]: true });
    pointer(list, "pointermove", 170, 120);
    expect([...selectedItems()].sort()).toEqual(["first", "third"]);
  });

  it("clears selection when clicking empty space", () => {
    const { list, selectedItems } = setup(["third"]);
    pointer(list, "pointerdown", 110, 60);
    pointer(list, "pointerup", 110, 60);
    expect(selectedItems().size).toBe(0);
    expect(document.body.querySelector(".pointer-events-none")).toBeNull();
  });

  it("accounts for the list's scroll position", () => {
    const { list, selectedItems } = setup([], 10);
    pointer(list, "pointerdown", 110, 55);
    pointer(list, "pointermove", 170, 105);
    expect([...selectedItems()]).toEqual(["first"]);
  });

  it("ignores entry presses and secondary buttons", () => {
    const { list, selectedItems, capture } = setup(["third"]);
    pointer(list.querySelector("li")!, "pointerdown", 130, 80);
    pointer(list, "pointerdown", 110, 60, { button: 2 });
    pointer(list, "pointermove", 170, 120);
    expect([...selectedItems()]).toEqual(["third"]);
    expect(capture).not.toHaveBeenCalled();
    expect(document.body.querySelector(".pointer-events-none")).toBeNull();
  });

  it.each(["pointerup", "pointercancel"])(
    "ends the gesture on %s and permits another drag",
    (endEvent) => {
      const { list, selectedItems } = setup();
      pointer(list, "pointerdown", 110, 60);
      pointer(list, "pointermove", 170, 120);
      pointer(list, endEvent, 170, 120);
      expect(document.body.querySelector(".pointer-events-none")).toBeNull();
      pointer(list, "pointermove", 290, 120);
      expect([...selectedItems()]).toEqual(["first"]);
      pointer(list, "pointerdown", 175, 60);
      pointer(list, "pointermove", 230, 120);
      expect([...selectedItems()]).toEqual(["second"]);
    },
  );

  it("removes the overlay and listeners when disposed mid-drag", () => {
    const { list, selectedItems, dispose, capture } = setup();
    pointer(list, "pointerdown", 110, 60);
    pointer(list, "pointermove", 170, 120);
    dispose();
    expect(document.body.querySelector(".pointer-events-none")).toBeNull();
    pointer(list, "pointermove", 290, 120);
    pointer(list, "pointerdown", 110, 60);
    expect([...selectedItems()]).toEqual(["first"]);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
