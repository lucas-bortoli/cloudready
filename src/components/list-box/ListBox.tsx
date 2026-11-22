import { For } from "solid-js";

/**
 * Items, selection, and callbacks for a controlled list box.
 *
 * @param T The type of item displayed in the list.
 */
export interface ListBoxProps<T> {
  /** Accessible name for the list box. */
  ariaLabel: string;
  /** Additional classes applied to the list box. */
  class?: string;
  /** Items displayed in order. */
  items: readonly T[];
  /** Selected item, compared by identity, or null when nothing is selected. */
  selected: T | null;
  /** Returns the text displayed for an item. */
  label: (item: T) => string;
  /** Requests a selection change; the caller must update `selected`. */
  onSelect: (item: T) => void;
  /** Called when an item is double-clicked or the selected item is activated with Enter. */
  onActivate: (item: T) => void;
}

/**
 * Displays a controlled, selectable list of items.
 *
 * Arrow keys, Home, and End request a selection change; Enter activates the
 * selected item. Clicking selects an item, and double-clicking activates it.
 *
 * @param props The items, selected item, labels, and interaction callbacks.
 */
export default function ListBox<T>(props: ListBoxProps<T>) {
  function handleKeyDown(event: KeyboardEvent) {
    const index = props.items.indexOf(props.selected as T);
    let next: number;
    if (event.key === "ArrowDown") next = Math.min(index + 1, props.items.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = props.items.length - 1;
    else if (event.key === "Enter" && props.selected !== null) {
      event.preventDefault();
      props.onActivate(props.selected);
      return;
    } else return;
    event.preventDefault();
    if (props.items[next] !== undefined) props.onSelect(props.items[next]);
  }

  return (
    <ol
      x-role="listbox"
      role="listbox"
      aria-label={props.ariaLabel}
      tabindex="0"
      class={[
        "min-h-20 flex-1 overflow-x-hidden overflow-y-auto border border-neutral-400 outline-sky-300 focus:outline-2 focus:outline-offset-2",
        props.class,
      ]}
      onKeyDown={handleKeyDown}
    >
      <For each={props.items}>
        {(item) => (
          <li
            role="option"
            aria-selected={item === props.selected ? "true" : "false"}
            class={["cursor-pointer truncate px-2 py-1", { "bg-sky-200": item === props.selected }]}
            onClick={props.onSelect.bind(null, item)}
            onDblClick={props.onActivate.bind(null, item)}
          >
            {props.label(item)}
          </li>
        )}
      </For>
    </ol>
  );
}
