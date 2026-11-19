import { For } from "solid-js";
import type { Topic } from "../../../../../../core/learning-program";

/** Props for a topic page. */
export interface TopicPageProps {
  /** Topic to display. */
  topic: Topic;
}

export default function TopicPage(props: TopicPageProps) {
  return (
    <div class="h-full w-full p-4">
      <h1 class="text-2xl">{props.topic.title}</h1>
      <ul>
        <For each={props.topic.items}>{(child) => <li>{child.title}</li>}</For>
      </ul>
    </div>
  );
}
