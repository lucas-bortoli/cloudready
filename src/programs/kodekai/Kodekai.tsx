import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";
import Dropdown from "../../components/dropdown/Dropdown";
import type { Bucket, Card, CardId, Model, ProjectId } from "./data";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";
import { createMockModel } from "./modelMockFixture";
import { truncateTextToFit } from "./truncateTextToFit";

export interface CardProps {
  card: Card;
  draggingCardId: Accessor<CardId | undefined>;
  onPointerDown: (card: Card, element: HTMLLIElement, event: PointerEvent) => void;
}

const priorityLabels: Record<Card["priority"], string> = {
  low: "Baixa prioridade",
  normal: "Prioridade normal",
  urgent: "Alta prioridade",
};

const formatExpiration = (expiration: Card["expiration"]) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(expiration),
  );

function Card(props: CardProps) {
  const [visibleTitle, setVisibleTitle] = createSignal("");
  const [visibleContent, setVisibleContent] = createSignal("");

  // The rendered elements determine how much text can fit in this card.
  let cardRef: HTMLLIElement | undefined;
  let titleRef: HTMLHeadingElement | undefined;
  let contentRef: HTMLParagraphElement | undefined;
  let truncateCard: ((title: string, content: string) => void) | undefined;

  // Re-measure after a parent supplies new content. The microtask lets Solid
  // commit the updated DOM before the measurement changes the displayed text.
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

    // A resize can change wrapping, so repeat the measurement for the current text.
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

export interface CategoryProps {
  projectId: Accessor<ProjectId | undefined>;
  bucket: Bucket;
  draggingCardId: Accessor<CardId | undefined>;
  indicator: Accessor<DropTarget | undefined>;
  onCardPointerDown: (card: Card, element: HTMLLIElement, event: PointerEvent) => void;
  onListElement: (bucket: Bucket, element: HTMLUListElement) => void;
}

interface DropTarget {
  bucket: Bucket;
  displayIndex: number;
  lineTop: number;
}

function Category(props: CategoryProps) {
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

  const labels: Record<Bucket, string> = {
    icebox: "Levantado",
    "in-progress": "Em andamento",
    blocked: "Com impedimento",
    revision: "Em revisão",
    done: "Concluído",
  };

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

const dragThreshold = 5;
const cardRepositionDuration = 180;

interface PendingDrag {
  card: Card;
  pointerId: number;
  source: HTMLLIElement;
  startX: number;
  startY: number;
}

function KodekaiView() {
  const model = useKodekai();
  const [selectedProject, setSelectedProject] = createSignal<ProjectId | undefined>(
    model().listProjects()[0]?.id,
  );
  const projects = createMemo(() => model().listProjects());
  const [draggingCardId, setDraggingCardId] = createSignal<CardId>();
  const [dropTarget, setDropTarget] = createSignal<DropTarget>();
  const bucketLists = new Map<Bucket, HTMLUListElement>();
  let rootElement: HTMLElement | undefined;
  let pendingDrag: PendingDrag | undefined;
  let preview: HTMLLIElement | undefined;
  let cancelCardRepositionAnimation: (() => void) | undefined;

  createEffect(() => {
    const selectedProjectId = selectedProject();
    if (projects().some((project) => project.id === selectedProjectId)) return;
    setSelectedProject(projects()[0]?.id);
  });

  const removeDocumentListeners = () => {
    document.removeEventListener("pointermove", onDocumentPointerMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerCancel);
  };

  const captureCardPositions = () => {
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

      const timeout = window.setTimeout(() => {
        cleanupCallbacks.forEach((cleanup) => cleanup());
      }, cardRepositionDuration);
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

    const currentCard = model().getCard(drag.card.id);
    if (currentCard.bucket === target.bucket && currentCard.displayIndex === target.displayIndex)
      return;
    console.debug("[Kodekai] committing card drop", {
      cardId: drag.card.id,
      from: { bucket: currentCard.bucket, displayIndex: currentCard.displayIndex },
      to: { bucket: target.bucket, displayIndex: target.displayIndex },
    });
    const previousPositions = captureCardPositions();
    if (previewPosition) previousPositions.set(drag.card.id, previewPosition);
    model().moveCard(drag.card.id, {
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
      // The positions immediately before and after the source card resolve to
      // its current index. They are no-op drops, so do not present a target.
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

  return (
    <section
      x-role="kodekai"
      ref={rootElement}
      class="flex h-full min-h-0 flex-col bg-white text-neutral-800"
    >
      <header class="border-b border-neutral-200 px-8 py-4">
        <Dropdown
          options={projects().map((project) => ({ value: project.id, label: project.title }))}
          value={selectedProject()}
          onValueChange={setSelectedProject}
          class="w-64"
        />
      </header>
      <section class="flex min-h-0 min-w-0 grow basis-0 gap-4 overflow-auto p-8 pt-4 *:shrink-0">
        <For
          each={["icebox", "in-progress", "blocked", "revision", "done"] satisfies Bucket[]}
          children={(bucket: Bucket) => (
            <Category
              bucket={bucket}
              projectId={selectedProject}
              draggingCardId={draggingCardId}
              indicator={dropTarget}
              onCardPointerDown={onCardPointerDown}
              onListElement={(nextBucket, element) => bucketLists.set(nextBucket, element)}
            />
          )}
        />
      </section>
    </section>
  );
}

export interface KodekaiProps {
  model?: Model;
}

export default function Kodekai(props: KodekaiProps) {
  const model = props.model ?? createMockModel();

  return (
    <KodekaiProvider model={model}>
      <KodekaiView />
    </KodekaiProvider>
  );
}
