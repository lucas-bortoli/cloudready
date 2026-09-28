import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { Bucket, Card, CardId, Model } from "../model/model";

const dragThreshold = 5;
const cardRepositionDuration = 180;
const buckets: readonly Bucket[] = ["icebox", "in-progress", "blocked", "revision", "done"];

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
  onCardKeyDown: (card: Card, element: HTMLLIElement, event: KeyboardEvent) => void;
  registerBucketList: (bucket: Bucket, element: HTMLUListElement) => void;
  shouldSuppressCardClick: () => boolean;
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
  let suppressNextCardClick = false;
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

  const focusCard = (cardId: CardId) => {
    const rootElement = options.rootElement();
    const card = Array.from(
      rootElement?.querySelectorAll<HTMLLIElement>("[data-kodekai-card]") ?? [],
    ).find((element) => element.dataset.kodekaiCard === cardId);
    card?.focus();
  };

  const moveCard = (
    card: Card,
    destination: { bucket: Bucket; displayIndex: number },
    previousPositions = captureCardPositions(),
  ) => {
    const currentCard = options.model().getCard(card.id);
    if (
      currentCard.bucket === destination.bucket &&
      currentCard.displayIndex === destination.displayIndex
    ) {
      return;
    }

    options.model().moveCard(card.id, destination);
    focusCard(card.id);
    animateCardRepositioning(previousPositions);
  };

  const endDrag = (commit: boolean, suppressClick = false) => {
    const drag = pendingDrag;
    const target = dropTarget();
    const previewPosition = preview?.getBoundingClientRect();
    const wasDragging = Boolean(preview);

    removeDocumentListeners();
    preview?.remove();
    preview = undefined;
    pendingDrag = undefined;
    setDraggingCardId();
    setDropTarget();
    suppressNextCardClick ||= suppressClick && wasDragging;

    if (!commit || !drag || !target) return;

    const currentCard = options.model().getCard(drag.card.id);
    if (currentCard.bucket === target.bucket && currentCard.displayIndex === target.displayIndex)
      return;

    const previousPositions = captureCardPositions();
    if (previewPosition) previousPositions.set(drag.card.id, previewPosition);
    moveCard(
      drag.card,
      {
        bucket: target.bucket,
        displayIndex: target.displayIndex,
      },
      previousPositions,
    );
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
    preview.style.opacity = "1";
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
    if (pendingDrag?.pointerId === event.pointerId) {
      endDrag(Boolean(preview && dropTarget()), true);
    }
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

  const onCardKeyDown = (card: Card, element: HTMLLIElement, event: KeyboardEvent) => {
    if (!event.shiftKey) return;

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      moveCard(card, {
        bucket: card.bucket,
        displayIndex: card.displayIndex + (event.key === "ArrowUp" ? -1 : 1),
      });
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();

    const bucketIndex = buckets.indexOf(card.bucket);
    const destinationBucket = buckets[bucketIndex + (event.key === "ArrowLeft" ? -1 : 1)];
    if (!destinationBucket) return;

    const destinationList = bucketLists.get(destinationBucket);
    if (!destinationList) return;

    const sourceCenter =
      element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2;
    const destinationCards = Array.from(
      destinationList.querySelectorAll<HTMLLIElement>("[data-kodekai-card]"),
    );
    const displayIndex = destinationCards.filter((destinationCard) => {
      const destinationRect = destinationCard.getBoundingClientRect();
      return sourceCenter > destinationRect.top + destinationRect.height / 2;
    }).length;

    moveCard(card, { bucket: destinationBucket, displayIndex });
  };

  onCleanup(() => {
    endDrag(false);
    cancelCardRepositionAnimation?.();
  });

  return {
    draggingCardId,
    dropTarget,
    onCardPointerDown,
    onCardKeyDown,
    registerBucketList: (bucket, element) => bucketLists.set(bucket, element),
    shouldSuppressCardClick: () => {
      const shouldSuppress = suppressNextCardClick;
      suppressNextCardClick = false;
      return shouldSuppress;
    },
  };
}
