import { createMemo, Match, Switch } from "solid-js";
import { useCurrentSubject } from "../components/subjects/useCurrentSubject";
import type { TopicItem } from "../core/learning-program";
import { useNavigation } from "../navigation/NavigationContext";
import SetPage from "./subjects/pages/items/pages/exercise-set/SetPage";
import FlashcardDeckPage from "./subjects/pages/items/pages/flashcard-deck/FlashcardDeckPage";
import LessonPage from "./subjects/pages/items/pages/lesson/LessonPage";
import SubjectPage from "./subjects/SubjectPage";
import HomePage from "./home/HomePage";
import TrashPage from "./trash/TrashPage";
import UnavailablePage from "./unavailable/UnavailablePage";
import TopicPage from "./subjects/pages/items/pages/topic/TopicPage";

function itemOfType<T extends TopicItem["type"]>(
  item: TopicItem | undefined,
  type: T,
): Extract<TopicItem, { type: T }> | undefined {
  return item?.type === type ? (item as Extract<TopicItem, { type: T }>) : undefined;
}

/** Displays the page for the current route. */
export default function PageRouter() {
  const navigation = useNavigation();
  const subject = useCurrentSubject();

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
    if (route.id === "/subjects/:subjectId/items/:itemId" && current) {
      return find(current.content.topics, route.itemId);
    } else {
      return undefined;
    }
  });

  const handleSelect = (id: string) => {
    const route = navigation.route();
    if (route.id === "/subjects/:subjectId" || route.id === "/subjects/:subjectId/items/:itemId")
      navigation.navigate({
        id: "/subjects/:subjectId/items/:itemId",
        subjectId: route.subjectId,
        itemId: id,
      });
  };

  return (
    <Switch>
      <Match when={navigation.route().id === "/"}>
        <HomePage />
      </Match>
      <Match when={navigation.route().id === "/trash"}>
        <TrashPage />
      </Match>
      <Match when={navigation.route().id === "/subjects/:subjectId"}>
        <SubjectPage onSelect={handleSelect} />
      </Match>
      <Match when={navigation.route().id === "/subjects/:subjectId/items/:itemId"}>
        <Switch fallback={<UnavailablePage />}>
          <Match when={itemOfType(selected(), "topic")}>
            {(item) => <TopicPage topic={item()} onSelect={handleSelect} />}
          </Match>
          <Match when={itemOfType(selected(), "lesson")}>
            {(item) => <LessonPage lesson={item()} onSelect={handleSelect} />}
          </Match>
          <Match when={itemOfType(selected(), "exercise-set")}>
            {(item) => <SetPage exerciseSet={item()} onSelect={handleSelect} />}
          </Match>
          <Match when={itemOfType(selected(), "flashcard-deck")}>
            {(item) => <FlashcardDeckPage deck={item()} onSelect={handleSelect} />}
          </Match>
        </Switch>
      </Match>
    </Switch>
  );
}
