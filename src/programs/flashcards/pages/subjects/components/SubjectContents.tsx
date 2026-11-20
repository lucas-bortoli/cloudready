import { createMemo, createSignal, For, Show, type ParentProps } from "solid-js";
import Button from "../../../../../components/button/Button";
import type { TopicItem } from "../../../core/learning-program";
import { collectReviewDecks } from "../../../core/subject-review";
import { SubjectDeckReview } from "../../../components/review/SubjectDeckReview";
import { TopicEntry } from "./TopicEntry";
import { useCurrentSubjectEntry } from "../../../components/subjects/useCurrentSubject";

// Retain only matching items and the topics needed to show their hierarchy.
function itemTree(items: TopicItem[], type: "exercise-set" | "flashcard-deck"): TopicItem[] {
  const result: TopicItem[] = [];
  for (const item of items) {
    if (item.type === type) {
      result.push(item);
    } else if (item.type === "topic") {
      const children = itemTree(item.items, type);
      if (children.length > 0) result.push({ ...item, items: children });
    }
  }
  return result;
}

/** Displays the contents of a subject or one of its nested topics. */
export function SubjectContents(
  props: ParentProps<{
    title: string;
    items: TopicItem[];
    emptyMessage: string;
    onSelect: (id: string) => void;
  }>,
) {
  const subject = useCurrentSubjectEntry();
  const otherItems = createMemo(() => props.items.filter((item) => item.type !== "exercise-set"));
  const exerciseSets = createMemo(() => itemTree(props.items, "exercise-set"));
  const flashcardDecks = createMemo(() => itemTree(props.items, "flashcard-deck"));

  // Bind a review session to the current subject and its collected decks.
  const scope = createMemo(() => {
    const entry = subject();
    if (entry) return { entry, decks: collectReviewDecks(props.items) };
  });
  const [activeScope, setActiveScope] = createSignal<ReturnType<typeof scope>>();

  const startReview = () => setActiveScope(scope());
  const endReview = () => setActiveScope(undefined);

  // Stop showing the session if navigation changes the subject or topic.
  const reviewScope = () => {
    const current = scope();
    if (current === activeScope()) return current;
  };

  return (
    <Show
      when={reviewScope()}
      keyed
      fallback={
        <div class="h-full w-full p-4">
          <h1 class="text-2xl">{props.title}</h1>
          {props.children}
          <Show when={props.items.length > 0} fallback={<p>{props.emptyMessage}</p>}>
            <Show when={otherItems().length > 0}>
              <h2 class="mt-2 text-xl">Subtopics</h2>
              <ul class="list-disc pl-6">
                <For each={otherItems()}>
                  {(item) => <TopicEntry item={item} onSelect={props.onSelect} />}
                </For>
              </ul>
            </Show>
          </Show>
          <Show when={exerciseSets().length > 0}>
            <h2 class="mt-2 text-xl">Exercise Sets</h2>
            <ul class="list-disc pl-6">
              <For each={exerciseSets()}>
                {(item) => <TopicEntry item={item} onSelect={props.onSelect} />}
              </For>
            </ul>
          </Show>
          <Show when={scope()?.decks.length}>
            <h2 class="mt-2 text-xl">Flashcard Decks</h2>
            <ul class="list-disc pl-6">
              <For each={flashcardDecks()}>
                {(item) => <TopicEntry item={item} onSelect={props.onSelect} />}
              </For>
            </ul>
            <Button class="my-2" onClick={startReview}>
              Review all decks
            </Button>
          </Show>
        </div>
      }
    >
      {(current) => (
        <SubjectDeckReview
          entry={current.entry}
          title={props.title}
          decks={current.decks}
          onSelect={props.onSelect}
          onEnd={endReview}
        />
      )}
    </Show>
  );
}
