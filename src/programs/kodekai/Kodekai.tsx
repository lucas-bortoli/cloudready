import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import Button from "../../components/button/Button";
import Dropdown from "../../components/dropdown/Dropdown";
import CardEditor from "./components/CardEditor";
import Category from "./components/Category";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";
import useCardDrag from "./lib/useCardDrag";
import { createMockModel } from "./model/fixture";
import type { Bucket, Card as CardData, CardId, Model, ProjectId } from "./model/model";

/** Renders the Kodekai board for the model supplied by its provider. */
function KodekaiView() {
  const model = useKodekai();
  const [selectedProject, setSelectedProject] = createSignal<ProjectId | undefined>(
    model().listProjects()[0]?.id,
  );
  const [rootElement, setRootElement] = createSignal<HTMLElement>();
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [editingCard, setEditingCard] = createSignal<CardData>();
  let focusReturnTarget: HTMLElement | undefined;
  let focusReturnCardId: CardId | undefined;
  const projects = createMemo(() => model().listProjects());
  const cardDrag = useCardDrag({ model, rootElement });

  const openEditor = (card?: CardData) => {
    focusReturnTarget =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    focusReturnCardId = card?.id;
    setEditingCard(card);
    setEditorOpen(true);
  };

  const closeEditor = (focusCardId = focusReturnCardId) => {
    const returnTarget = focusReturnTarget;
    const returnCardId = focusCardId;
    setEditorOpen(false);
    setEditingCard(undefined);
    focusReturnTarget = undefined;
    focusReturnCardId = undefined;

    queueMicrotask(() => {
      const updatedCard = returnCardId
        ? Array.from(
            rootElement()?.querySelectorAll<HTMLElement>("[data-kodekai-card]") ?? [],
          ).find((element) => element.dataset.kodekaiCard === returnCardId)
        : undefined;
      (updatedCard ?? (returnTarget?.isConnected ? returnTarget : undefined))?.focus();
    });
  };

  createEffect(() => {
    const selectedProjectId = selectedProject();
    if (projects().some((project) => project.id === selectedProjectId)) return;
    setSelectedProject(projects()[0]?.id);
  });

  return (
    <section
      x-role="kodekai"
      ref={setRootElement}
      class="relative flex h-full min-h-0 flex-col bg-white text-neutral-800"
    >
      <header class="border-b border-neutral-200 px-8 py-4">
        <Dropdown
          options={projects().map((project) => ({ value: project.id, label: project.title }))}
          value={selectedProject()}
          onValueChange={setSelectedProject}
          class="w-64"
        />
        <Button class="ml-3" onClick={() => openEditor()}>
          Novo cartão
        </Button>
      </header>
      <section class="flex min-h-0 min-w-0 grow basis-0 gap-4 overflow-auto p-8 pt-4 *:shrink-0">
        <For
          each={["icebox", "in-progress", "blocked", "revision", "done"] satisfies Bucket[]}
          children={(bucket: Bucket) => (
            <Category
              bucket={bucket}
              projectId={selectedProject}
              draggingCardId={cardDrag.draggingCardId}
              indicator={cardDrag.dropTarget}
              onCardPointerDown={cardDrag.onCardPointerDown}
              onCardKeyDown={cardDrag.onCardKeyDown}
              onListElement={cardDrag.registerBucketList}
              onCardSelect={openEditor}
              shouldSuppressCardClick={cardDrag.shouldSuppressCardClick}
            />
          )}
        />
      </section>
      <Show when={editorOpen() && selectedProject()}>
        {(projectId) => (
          <CardEditor
            card={editingCard()}
            projectId={projectId()}
            onClose={closeEditor}
            onCreate={(card) => {
              closeEditor(model().createCard(card));
            }}
            onUpdate={(card, changes) => {
              model().updateCard(card.id, changes);
              closeEditor();
            }}
          />
        )}
      </Show>
    </section>
  );
}

/** Optional model override for controlled rendering and integration tests. */
export interface KodekaiProps {
  model?: Model;
}

/** Provides and renders the Kodekai project board. */
export default function Kodekai(props: KodekaiProps) {
  const model = props.model ?? createMockModel();

  return (
    <KodekaiProvider model={model}>
      <KodekaiView />
    </KodekaiProvider>
  );
}
