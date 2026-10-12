import { createMemo, For, type Accessor } from "solid-js";
import { cn } from "../../../lib/dom";
import { useKodekai } from "../KodekaiContext";
import { visibleCards, type CardSort, type DueFilter } from "../lib/cardView";
import type { DropTarget } from "../lib/useCardDrag";
import type { Bucket, Card as CardData, CardId, Priority, ProjectId, TagId } from "../model/model";
import Card from "./Card";

/** Properties for one project bucket and its card list. */
export interface CategoryProps {
  projectId: Accessor<ProjectId | undefined>;
  bucket: Bucket;
  query: Accessor<string>;
  priority: Accessor<Priority | "all">;
  due: Accessor<DueFilter>;
  tagId: Accessor<TagId | undefined>;
  sort: Accessor<CardSort>;
  draggingCardId: Accessor<CardId | undefined>;
  indicator: Accessor<DropTarget | undefined>;
  onCardPointerDown: (card: CardData, element: HTMLLIElement, event: PointerEvent) => void;
  onCardKeyDown: (card: CardData, element: HTMLLIElement, event: KeyboardEvent) => void;
  onListElement: (bucket: Bucket, element: HTMLUListElement) => void;
  onCardSelect: (card: CardData) => void;
  shouldSuppressCardClick: () => boolean;
}

const labels: Record<Bucket, string> = {
  icebox: "Levantado",
  "in-progress": "Em andamento",
  blocked: "Com impedimento",
  revision: "Em revisão",
  done: "Concluído",
};

/** Renders one bucket, its cards, and the absolute drop indicator. */
export default function Category(props: CategoryProps) {
  const model = useKodekai();
  const cards = createMemo(() => {
    const projectId = props.projectId();
    if (!projectId) return [];
    const currentModel = model();
    if (!currentModel.listProjects().some((project) => project.id === projectId)) return [];
    return visibleCards(
      currentModel.listCards(projectId).filter((card) => card.bucket === props.bucket),
      {
        query: props.query(),
        priority: props.priority(),
        due: props.due(),
        tagId: props.tagId(),
        sort: props.sort(),
        today: new Date(),
      },
    );
  });
  const canReorder = () =>
    props.sort() === "manual" &&
    !props.query().trim() &&
    props.priority() === "all" &&
    props.due() === "all" &&
    !props.tagId();

  return (
    <section class="flex w-64 flex-col gap-1">
      <h2
        class={cn(
          "border-b-2 pb-2 font-medium",
          props.bucket === "icebox" && "border-neutral-700 text-neutral-700",
          props.bucket === "in-progress" && "border-sky-700 text-sky-700",
          props.bucket === "blocked" && "border-red-700 text-red-700",
          props.bucket === "revision" && "border-yellow-700 text-yellow-700",
          props.bucket === "done" && "border-green-700 text-green-700",
        )}
      >
        {labels[props.bucket]} {cards().length > 0 && `(${cards().length})`}
      </h2>
      <ul
        ref={(element) => props.onListElement(props.bucket, element)}
        data-kodekai-bucket={props.bucket}
        class="relative flex min-h-full flex-col gap-1 pb-8"
      >
        <For
          each={cards()}
          children={(card) => (
            <Card
              card={card}
              tags={model()
                .listTags(card.projectId)
                .filter((tag) => card.tagIds.includes(tag.id))}
              draggingCardId={props.draggingCardId}
              onPointerDown={canReorder() ? props.onCardPointerDown : undefined}
              onKeyDown={canReorder() ? props.onCardKeyDown : undefined}
              onSelect={props.onCardSelect}
              shouldSuppressClick={props.shouldSuppressCardClick}
            />
          )}
        />
        {cards().length === 0 &&
          (props.query() ||
            props.priority() !== "all" ||
            props.due() !== "all" ||
            props.tagId()) && (
            <li class="py-3 text-center text-sm text-neutral-500">No matching cards</li>
          )}
        {props.indicator()?.bucket === props.bucket && (
          <div
            data-kodekai-drop-indicator=""
            class="pointer-events-none absolute right-0 left-0 z-10 h-0.5 -translate-y-1/2 bg-blue-600"
            style={{ top: `${props.indicator()!.lineTop}px` }}
          />
        )}
      </ul>
    </section>
  );
}
