import { createMemo, Match, Switch } from "solid-js";
import { useNavigation } from "../components/navigation/NavigationContext";
import { useSubjects } from "../components/subjects/SubjectsContext";
import type { TopicItem } from "../core/learning-program";
import ExerciseSetPage from "./exercise-set/ExerciseSetPage";
import FlashcardDeckPage from "./flashcard-deck/FlashcardDeckPage";
import LessonPage from "./lesson/LessonPage";
import TopicPage from "./topic/TopicPage";

function itemOfType<T extends TopicItem["type"]>(
  item: TopicItem | undefined,
  type: T,
): Extract<TopicItem, { type: T }> | undefined {
  return item?.type === type ? (item as Extract<TopicItem, { type: T }>) : undefined;
}

/** Resolves and displays the item named by the current route. */
export default function ItemRoute() {
  const subjects = useSubjects();
  const navigation = useNavigation();
  const subject = createMemo(() => {
    const route = navigation.route();
    if (route.page === "subject" || route.page === "item") {
      return subjects.subjects().find((entry) => entry.path === route.subjectPath)?.subject;
    } else {
      return undefined;
    }
  });

  const find = (items: TopicItem[], id: string): TopicItem | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.type === "topic") {
        const found = find(item.items, id);
        if (found) return found;
      }
    }
  };

  const selected = createMemo(() => {
    const route = navigation.route();
    const current = subject();
    if (route.page === "item" && current) {
      return find(current.content.topics, route.itemId);
    } else {
      return undefined;
    }
  });

  const handleSelect = (id: string) => {
    const route = navigation.route();
    if (route.page === "subject" || route.page === "item")
      navigation.navigate({ page: "item", subjectPath: route.subjectPath, itemId: id });
  };

  return (
    <Switch fallback={<p>This subject or item is unavailable.</p>}>
      <Match when={itemOfType(selected(), "topic")}>{(item) => <TopicPage topic={item()} />}</Match>
      <Match when={itemOfType(selected(), "lesson")}>
        {(item) => <LessonPage lesson={item()} onSelect={handleSelect} />}
      </Match>
      <Match when={itemOfType(selected(), "exercise-set")}>
        {(item) => <ExerciseSetPage exerciseSet={item()} />}
      </Match>
      <Match when={itemOfType(selected(), "flashcard-deck")}>
        {(item) => <FlashcardDeckPage deck={item()} />}
      </Match>
    </Switch>
  );
}
