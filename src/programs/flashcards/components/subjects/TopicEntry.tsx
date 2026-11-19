import { For, Show } from "solid-js";
import type { TopicItem } from "../../core/learning-program";

/** Displays a subject item and its nested topic items as navigation links. */
export function TopicEntry(props: { item: TopicItem; onSelect: (id: string) => void }) {
  return (
    <li>
      <button
        class="text-left outline-sky-300 hover:underline focus:outline-2 focus:outline-offset-2"
        onClick={props.onSelect.bind(null, props.item.id)}
      >
        {props.item.title}
      </button>
      <Show when={props.item.type === "topic" && props.item}>
        {(topic) => (
          <Show when={topic().type === "topic" && topic().items.length}>
            <ul class="list-disc pl-6">
              <For each={topic().type === "topic" && topic().items}>
                {(item) => <TopicEntry item={item} onSelect={props.onSelect} />}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </li>
  );
}
