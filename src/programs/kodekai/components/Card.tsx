import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import type { Card as CardData, CardId } from "../model/model";
import { truncateTextToFit } from "../lib/truncateTextToFit";

/** Properties required to render one draggable Kodekai card. */
export interface CardProps {
  card: CardData;
  draggingCardId: Accessor<CardId | undefined>;
  onPointerDown: (card: CardData, element: HTMLLIElement, event: PointerEvent) => void;
}

const priorityLabels: Record<CardData["priority"], string> = {
  low: "Baixa prioridade",
  normal: "Prioridade normal",
  urgent: "Alta prioridade",
};

const formatExpiration = (expiration: CardData["expiration"]) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(expiration),
  );

/** Renders one Kodekai card and keeps its title and content within its fixed height. */
export default function Card(props: CardProps) {
  const [visibleTitle, setVisibleTitle] = createSignal("");
  const [visibleContent, setVisibleContent] = createSignal("");

  let cardRef: HTMLLIElement | undefined;
  let titleRef: HTMLHeadingElement | undefined;
  let contentRef: HTMLParagraphElement | undefined;
  let truncateCard: ((title: string, content: string) => void) | undefined;

  createEffect(() => {
    const title = props.card.title;
    const content = props.card.content;
    queueMicrotask(() => truncateCard?.(title, content));
  });

  onMount(() => {
    truncateCard = (title, content) => {
      if (!cardRef || !titleRef || !contentRef) return;

      setVisibleTitle(
        truncateTextToFit(title, titleRef, () => titleRef.scrollHeight <= titleRef.clientHeight),
      );
      setVisibleContent(
        truncateTextToFit(
          content,
          contentRef,
          () =>
            cardRef.scrollHeight <= cardRef.clientHeight &&
            contentRef.scrollHeight <= contentRef.clientHeight,
        ),
      );
    };

    const observer = new ResizeObserver(() => truncateCard?.(props.card.title, props.card.content));
    observer.observe(cardRef!);
    truncateCard(props.card.title, props.card.content);
    onCleanup(() => observer.disconnect());
  });

  return (
    <li
      ref={cardRef}
      data-kodekai-card={props.card.id}
      class="flex max-h-32 cursor-grab touch-none flex-col gap-1 overflow-hidden rounded-sm border border-neutral-400 bg-white p-2 shadow-md **:pointer-events-none"
      classList={{
        "cursor-grabbing": props.draggingCardId() === props.card.id,
        "opacity-0": props.draggingCardId() === props.card.id,
      }}
      onPointerDown={(event) => {
        if (cardRef) props.onPointerDown(props.card, cardRef, event);
      }}
    >
      <h2 ref={titleRef} class="max-h-10 shrink-0 overflow-hidden leading-snug font-medium">
        {visibleTitle()}
      </h2>
      <p ref={contentRef} class="overflow-hidden leading-snug">
        {visibleContent()}
      </p>
      <footer class="flex shrink-0 flex-wrap gap-1">
        <span class="rounded-xs bg-amber-400 px-2 py-0.5 text-sm">
          {priorityLabels[props.card.priority]}
        </span>
        <span class="rounded-xs bg-amber-400 px-2 py-0.5 text-sm">
          {formatExpiration(props.card.expiration)}
        </span>
      </footer>
    </li>
  );
}
