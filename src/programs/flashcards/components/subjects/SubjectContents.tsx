import { createMemo, createSignal, For, Show, type ParentProps } from "solid-js";
import Button from "../../../../components/button/Button";
import { SubjectDeckReview } from "../review/SubjectDeckReview";
import { useCurrentSubjectEntry } from "./useCurrentSubject";
import { collectReviewDecks } from "../../core/subject-review";
import type { TopicItem } from "../../core/learning-program";
import { TopicEntry } from "./TopicEntry";

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
  const scope = createMemo(() => {
    const entry = subject();
    if (entry) return { entry, decks: collectReviewDecks(props.items) };
  });
  const [activeScope, setActiveScope] = createSignal<ReturnType<typeof scope>>();
  const startReview = () => setActiveScope(scope());
  const endReview = () => setActiveScope(undefined);
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
          <Show when={scope()?.decks.length}>
            <Button class="my-2" onClick={startReview}>
              Review all decks
            </Button>
          </Show>
          <Show when={props.items.length > 0} fallback={<p>{props.emptyMessage}</p>}>
            <ul class="list-disc pl-6">
              <For each={props.items}>
                {(item) => <TopicEntry item={item} onSelect={props.onSelect} />}
              </For>
            </ul>
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
