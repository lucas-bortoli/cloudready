import { For } from "solid-js";

export interface ListBoxProps<T> {
  items: readonly T[];
  selected: T | null;
  current: T | null;
  label: (item: T) => string;
  onSelect: (item: T) => void;
  onActivate: (item: T) => void;
}

/** A selectable list with a separately indicated current item. */
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
    <div
      x-role="listbox"
      role="listbox"
      aria-label="Playback queue"
      tabindex="0"
      class="min-h-20 flex-1 overflow-auto border border-neutral-400 outline-sky-300 focus:outline-2 focus:outline-offset-2"
      onKeyDown={handleKeyDown}
    >
      <For each={props.items}>
        {(item) => (
          <div
            role="option"
            aria-selected={item === props.selected ? "true" : "false"}
            class={[
              "cursor-pointer px-2 py-1",
              { "bg-sky-200": item === props.selected, "font-bold": item === props.current },
            ]}
            onClick={props.onSelect.bind(null, item)}
            onDblClick={props.onActivate.bind(null, item)}
          >
            {item === props.current ? "▶ " : ""}
            {props.label(item)}
          </div>
        )}
      </For>
    </div>
  );
}
