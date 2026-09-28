import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";
import { cn } from "../../../lib/dom";
import { truncateTextToFit } from "../lib/truncateTextToFit";
import type { Card as CardData, CardId } from "../model/model";

/** Properties required to render one draggable Kodekai card. */
export interface CardProps {
  card: CardData;
  draggingCardId: Accessor<CardId | undefined>;
  onPointerDown: (card: CardData, element: HTMLLIElement, event: PointerEvent) => void;
  onKeyDown: (card: CardData, element: HTMLLIElement, event: KeyboardEvent) => void;
  onSelect: (card: CardData) => void;
  shouldSuppressClick: () => boolean;
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

  const isExpired = createMemo(() => {
    return new Date(props.card.expiration) < new Date();
  });

  return (
    <li
      ref={cardRef}
      data-kodekai-card={props.card.id}
      role="button"
      tabIndex={0}
      class="flex max-h-32 shrink-0 touch-none flex-col gap-1 overflow-hidden rounded-xs border border-neutral-400 bg-white p-2 shadow-sm **:pointer-events-none focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
      classList={{
        "opacity-0": props.draggingCardId() === props.card.id,
      }}
      onPointerDown={(event) => {
        if (cardRef) props.onPointerDown(props.card, cardRef, event);
      }}
      onClick={() => {
        if (!props.shouldSuppressClick()) props.onSelect(props.card);
      }}
      onKeyDown={(event) => {
        if (cardRef) props.onKeyDown(props.card, cardRef, event);
        if (event.defaultPrevented) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect(props.card);
        }
      }}
    >
      <h2 ref={titleRef} class="max-h-10 shrink-0 overflow-hidden leading-tight font-medium">
        {visibleTitle()}
      </h2>
      <p ref={contentRef} class="overflow-hidden leading-tight text-neutral-600">
        {visibleContent()}
      </p>
      <footer class="mt-1 flex shrink-0 flex-wrap gap-1">
        <span
          class={cn(
            "rounded-xs px-2 py-0.5 text-sm",
            !isExpired() && "bg-amber-50",
            isExpired() && "bg-amber-400",
          )}
        >
          {formatExpiration(props.card.expiration)}
        </span>
        <span
          class={cn(
            "rounded-xs px-2 py-0.5 text-sm",
            props.card.priority === "low" && "bg-white",
            props.card.priority === "normal" && "bg-amber-100",
            props.card.priority === "urgent" && "bg-amber-400",
          )}
        >
          {priorityLabels[props.card.priority]}
        </span>
      </footer>
    </li>
  );
}
