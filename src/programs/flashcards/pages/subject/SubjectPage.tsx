import { For, Show } from "solid-js";
import { useNavigation } from "../../components/navigation/NavigationContext";
import { useSubjects } from "../../components/subjects/SubjectsContext";
import type { TopicItem } from "../../core/learning-program";

function TopicEntry(props: { item: TopicItem; onSelect: (id: string) => void }) {
  return (
    <li>
      <button
        class="text-left outline-sky-300 hover:underline focus:outline-2 focus:outline-offset-2"
        onClick={props.onSelect.bind(null, props.item.id)}
      >
        {props.item.title}
      </button>
      <Show
        when={props.item.type === "topic" && props.item}
        children={(topic) => (
          <Show when={topic().type === "topic" && topic().items.length}>
            <ul class="list-disc pl-6">
              <For
                each={topic().type === "topic" && topic().items}
                children={(item) => <TopicEntry item={item} onSelect={props.onSelect} />}
              />
            </ul>
          </Show>
        )}
      />
    </li>
  );
}

export default function SubjectPage() {
  const subjects = useSubjects();
  const navigation = useNavigation();

  const handleSelect = (id: string) => {
    const route = navigation.route();
    if (route.page === "subject" || route.page === "item") {
      navigation.navigate({ page: "item", subjectPath: route.subjectPath, itemId: id });
    }
  };

  const subject = () => {
    const route = navigation.route();
    if (route.page === "subject" || route.page === "item") {
      return subjects.subjects().find((entry) => entry.path === route.subjectPath)?.subject;
    } else {
      return undefined;
    }
  };

  return (
    <Show when={subject()} fallback={<p>This subject is unavailable.</p>}>
      {(subject) => (
        <div class="h-full w-full p-4">
          <h1 class="text-2xl">{subject().manifest.title}</h1>
          <p>{subject().manifest.description}</p>
          <p>{subject().manifest.language}</p>
          <h2 class="mt-6 mb-3 text-xl font-semibold">Topics</h2>
          <Show
            when={subject().content.topics.length}
            fallback={<p>This subject has no topics yet.</p>}
          >
            <ul class="list-disc pl-6">
              <For each={subject().content.topics}>
                {(topic) => <TopicEntry item={topic} onSelect={handleSelect} />}
              </For>
            </ul>
          </Show>
        </div>
      )}
    </Show>
  );
}
