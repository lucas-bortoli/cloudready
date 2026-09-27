import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { Bucket, Card, CardId, Model } from "../model/model";

const dragThreshold = 5;
const cardRepositionDuration = 180;

/** A valid insertion point, measured relative to the destination bucket list. */
export interface DropTarget {
  bucket: Bucket;
  displayIndex: number;
  lineTop: number;
}

/** Callbacks and reactive state used to connect the drag controller to board markup. */
export interface CardDragController {
  draggingCardId: Accessor<CardId | undefined>;
  dropTarget: Accessor<DropTarget | undefined>;
  onCardPointerDown: (card: Card, element: HTMLLIElement, event: PointerEvent) => void;
  registerBucketList: (bucket: Bucket, element: HTMLUListElement) => void;
}

/** Dependencies for the board-local card dragging interaction. */
export interface UseCardDragOptions {
  model: Accessor<Model>;
  rootElement: Accessor<HTMLElement | undefined>;
}

interface PendingDrag {
  card: Card;
  pointerId: number;
  source: HTMLLIElement;
  startX: number;
  startY: number;
}

/**
 * Coordinates Pointer Events card dragging for a Kodekai board.
 *
 * The source remains in layout with zero opacity, while a cloned preview follows
 * the pointer. On drop, the model is updated once and FLIP transforms animate
 * every repositioned card without changing list layout during the drag.
 */
export default function useCardDrag(options: UseCardDragOptions): CardDragController {
  const [draggingCardId, setDraggingCardId] = createSignal<CardId>();
  const [dropTarget, setDropTarget] = createSignal<DropTarget>();
  const bucketLists = new Map<Bucket, HTMLUListElement>();
  let pendingDrag: PendingDrag | undefined;
  let preview: HTMLLIElement | undefined;
  let cancelCardRepositionAnimation: (() => void) | undefined;

  const removeDocumentListeners = () => {
    document.removeEventListener("pointermove", onDocumentPointerMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerCancel);
  };

  const captureCardPositions = () => {
    const rootElement = options.rootElement();
    if (!rootElement) return new Map<string, DOMRect>();

    return new Map(
      Array.from(rootElement.querySelectorAll<HTMLLIElement>("[data-kodekai-card]"), (card) => [
        card.dataset.kodekaiCard!,
        card.getBoundingClientRect(),
      ]),
    );
  };

  const animateCardRepositioning = (previousPositions: ReadonlyMap<string, DOMRect>) => {
    cancelCardRepositionAnimation?.();

    const animationFrame = requestAnimationFrame(() => {
      const rootElement = options.rootElement();
      if (!rootElement) return;

      const cleanupCallbacks: (() => void)[] = [];
      for (const card of rootElement.querySelectorAll<HTMLLIElement>("[data-kodekai-card]")) {
        const previousPosition = previousPositions.get(card.dataset.kodekaiCard!);
        if (!previousPosition) continue;

        const currentPosition = card.getBoundingClientRect();
        const horizontalOffset = previousPosition.left - currentPosition.left;
        const verticalOffset = previousPosition.top - currentPosition.top;
        if (horizontalOffset === 0 && verticalOffset === 0) continue;

        card.style.transition = "none";
        card.style.transform = `translate(${horizontalOffset}px, ${verticalOffset}px)`;
        void card.offsetWidth;
        card.style.transition = `transform ${cardRepositionDuration}ms ease-out`;
        card.style.transform = "";

        const cleanup = () => {
          card.style.transition = "";
          card.removeEventListener("transitionend", cleanup);
        };
        card.addEventListener("transitionend", cleanup);
        cleanupCallbacks.push(cleanup);
      }

      const timeout = window.setTimeout(
        () => cleanupCallbacks.forEach((cleanup) => cleanup()),
        cardRepositionDuration,
      );
      cancelCardRepositionAnimation = () => {
        cancelAnimationFrame(animationFrame);
        window.clearTimeout(timeout);
        cleanupCallbacks.forEach((cleanup) => cleanup());
      };
    });

    cancelCardRepositionAnimation = () => cancelAnimationFrame(animationFrame);
  };

  const endDrag = (commit: boolean) => {
    const drag = pendingDrag;
    const target = dropTarget();
    const previewPosition = preview?.getBoundingClientRect();

    removeDocumentListeners();
    preview?.remove();
    preview = undefined;
    pendingDrag = undefined;
    setDraggingCardId();
    setDropTarget();

    if (!commit || !drag || !target) return;

    const currentCard = options.model().getCard(drag.card.id);
    if (currentCard.bucket === target.bucket && currentCard.displayIndex === target.displayIndex)
      return;

    console.debug("[Kodekai] committing card drop", {
      cardId: drag.card.id,
      from: { bucket: currentCard.bucket, displayIndex: currentCard.displayIndex },
      to: { bucket: target.bucket, displayIndex: target.displayIndex },
    });
    const previousPositions = captureCardPositions();
    if (previewPosition) previousPositions.set(drag.card.id, previewPosition);
    options.model().moveCard(drag.card.id, {
      bucket: target.bucket,
      displayIndex: target.displayIndex,
    });
    animateCardRepositioning(previousPositions);
  };

  const updatePreview = (event: PointerEvent) => {
    if (!preview || !pendingDrag) return;
    preview.style.left = `${event.clientX - (pendingDrag.startX - pendingDrag.source.getBoundingClientRect().left)}px`;
    preview.style.top = `${event.clientY - (pendingDrag.startY - pendingDrag.source.getBoundingClientRect().top)}px`;
  };

  const updateDropTarget = (event: PointerEvent) => {
    if (!pendingDrag) return;

    for (const [bucket, list] of bucketLists) {
      const listRect = list.getBoundingClientRect();
      if (
        event.clientX < listRect.left ||
        event.clientX > listRect.right ||
        event.clientY < listRect.top ||
        event.clientY > listRect.bottom
      ) {
        continue;
      }

      const allCards = Array.from(list.querySelectorAll<HTMLLIElement>("[data-kodekai-card]"));
      const cardsWithoutSource = allCards.filter((card) => card !== pendingDrag!.source);
      const displayIndex = cardsWithoutSource.filter(
        (card) =>
          event.clientY >
          card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2,
      ).length;

      if (bucket === pendingDrag.card.bucket && displayIndex === pendingDrag.card.displayIndex) {
        setDropTarget();
        return;
      }

      const lineCard = allCards.find(
        (card) =>
          event.clientY <=
          card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2,
      );
      const lineTop = lineCard
        ? lineCard.getBoundingClientRect().top - listRect.top
        : allCards.length > 0
          ? allCards[allCards.length - 1].getBoundingClientRect().bottom - listRect.top
          : 0;

      setDropTarget({ bucket, displayIndex, lineTop });
      return;
    }

    setDropTarget();
  };

  const beginDragging = (event: PointerEvent) => {
    const rootElement = options.rootElement();
    if (!pendingDrag || !rootElement) return;

    const sourceRect = pendingDrag.source.getBoundingClientRect();
    preview = pendingDrag.source.cloneNode(true) as HTMLLIElement;
    preview.removeAttribute("data-kodekai-card");
    preview.setAttribute("aria-hidden", "true");
    preview.style.position = "fixed";
    preview.style.zIndex = "50";
    preview.style.width = `${sourceRect.width}px`;
    preview.style.height = `${sourceRect.height}px`;
    preview.style.margin = "0";
    preview.style.pointerEvents = "none";
    preview.style.cursor = "grabbing";
    preview.style.opacity = "0.9";
    rootElement.append(preview);
    setDraggingCardId(pendingDrag.card.id);
    updatePreview(event);
    updateDropTarget(event);
  };

  const onDocumentPointerMove = (event: PointerEvent) => {
    const drag = pendingDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (!preview) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < dragThreshold) return;
      beginDragging(event);
    }

    event.preventDefault();
    updatePreview(event);
    updateDropTarget(event);
  };

  const onDocumentPointerUp = (event: PointerEvent) => {
    if (pendingDrag?.pointerId === event.pointerId) endDrag(Boolean(preview && dropTarget()));
  };

  const onDocumentPointerCancel = (event: PointerEvent) => {
    if (pendingDrag?.pointerId === event.pointerId) endDrag(false);
  };

  const onCardPointerDown = (card: Card, element: HTMLLIElement, event: PointerEvent) => {
    if (event.button !== 0 || pendingDrag) return;

    pendingDrag = {
      card,
      pointerId: event.pointerId,
      source: element,
      startX: event.clientX,
      startY: event.clientY,
    };
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
    document.addEventListener("pointercancel", onDocumentPointerCancel);
  };

  onCleanup(() => {
    endDrag(false);
    cancelCardRepositionAnimation?.();
  });

  return {
    draggingCardId,
    dropTarget,
    onCardPointerDown,
    registerBucketList: (bucket, element) => bucketLists.set(bucket, element),
  };
}
