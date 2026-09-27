import { createEffect, createMemo, For, type Accessor } from "solid-js";
import { useKodekai } from "../KodekaiContext";
import type { DropTarget } from "../lib/useCardDrag";
import type { Bucket, Card as CardData, CardId, ProjectId } from "../model/model";
import Card from "./Card";

/** Properties for one project bucket and its card list. */
export interface CategoryProps {
  projectId: Accessor<ProjectId | undefined>;
  bucket: Bucket;
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
    return currentModel.listCards(projectId).filter((card) => card.bucket === props.bucket);
  });

  createEffect(() => {
    console.debug("[Kodekai] bucket card list refreshed", {
      bucket: props.bucket,
      cards: cards().map(({ displayIndex, id }) => ({ displayIndex, id })),
    });
  });

  return (
    <section class="flex w-64 flex-col gap-1">
      <h2>
        {labels[props.bucket]} {cards().length > 0 && `(${cards().length})`}
      </h2>
      <ul
        ref={(element) => props.onListElement(props.bucket, element)}
        data-kodekai-bucket={props.bucket}
        class="relative flex min-h-full flex-col gap-2 pb-8"
      >
        <For
          each={cards()}
          children={(card) => (
            <Card
              card={card}
              draggingCardId={props.draggingCardId}
              onPointerDown={props.onCardPointerDown}
              onKeyDown={props.onCardKeyDown}
              onSelect={props.onCardSelect}
              shouldSuppressClick={props.shouldSuppressCardClick}
            />
          )}
        />
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
