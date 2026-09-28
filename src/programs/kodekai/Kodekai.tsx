import Edit16 from "@carbon/icons/es/edit/16.js";
import FolderAdd16 from "@carbon/icons/es/folder--add/16.js";
import TaskAdd16 from "@carbon/icons/es/task--add/16.js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import Button from "../../components/button/Button";
import Dropdown from "../../components/dropdown/Dropdown";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import CardEditor from "./components/CardEditor";
import Category from "./components/Category";
import ProjectEditor from "./components/ProjectEditor";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";
import useCardDrag from "./lib/useCardDrag";
import { createMockModel } from "./model/fixture";
import type { Bucket, Card as CardData, CardId, Model, Project, ProjectId } from "./model/model";

/** Renders the Kodekai board for the model supplied by its provider. */
function KodekaiView() {
  const model = useKodekai();
  const [selectedProject, setSelectedProject] = createSignal<ProjectId | undefined>(
    model().listProjects()[0]?.id,
  );
  const [rootElement, setRootElement] = createSignal<HTMLElement>();
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [editingCard, setEditingCard] = createSignal<CardData>();
  const [projectEditorOpen, setProjectEditorOpen] = createSignal(false);
  const [editingProject, setEditingProject] = createSignal<Project>();
  let focusReturnTarget: HTMLElement | undefined;
  let focusReturnCardId: CardId | undefined;
  let projectFocusReturnTarget: HTMLElement | undefined;
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

  const openProjectEditor = (project?: Project, returnTarget?: HTMLElement) => {
    projectFocusReturnTarget =
      returnTarget ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    setEditingProject(project);
    setProjectEditorOpen(true);
  };

  const closeProjectEditor = () => {
    const returnTarget = projectFocusReturnTarget;
    setProjectEditorOpen(false);
    setEditingProject(undefined);
    projectFocusReturnTarget = undefined;

    queueMicrotask(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
    });
  };

  createEffect(() => {
    const selectedProjectId = selectedProject();
    if (selectedProjectId === undefined) return;
    if (!projects().some((project) => project.id === selectedProjectId)) {
      setSelectedProject(undefined);
    }
  });

  return (
    <section
      x-role="kodekai"
      ref={setRootElement}
      class="relative flex h-full min-h-0 flex-col bg-white text-neutral-800"
    >
      <header class="flex items-center border-b border-neutral-200 px-8 py-4">
        <Dropdown
          options={projects().map((project) => ({ value: project.id, label: project.title }))}
          value={selectedProject()}
          onValueChange={setSelectedProject}
          class="w-45"
        />
        <Button
          class="ml-1 px-2!"
          disabled={!selectedProject()}
          title="Edit Project..."
          onClick={(event) => {
            const projectId = selectedProject();
            if (projectId) openProjectEditor(model().getProject(projectId), event.currentTarget);
          }}
          startIcon={<CarbonIcon icon={Edit16} />}
        />
        <Button
          class="ml-1 px-2!"
          title="New Project..."
          onClick={(event) => openProjectEditor(undefined, event.currentTarget)}
          startIcon={<CarbonIcon icon={FolderAdd16} />}
        />
        <Button
          class="ml-4 px-2!"
          disabled={!selectedProject()}
          title="New Card..."
          onClick={() => openEditor()}
          startIcon={<CarbonIcon icon={TaskAdd16} />}
        />
      </header>
      <section class="flex min-h-0 min-w-0 grow basis-0 gap-1 overflow-auto p-8 pt-4 *:shrink-0">
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
            onCreate={(card) => model().createCard(card)}
            onDelete={(card) => {
              model().deleteCard(card.id);
            }}
            onUpdate={(card, changes) => {
              model().updateCard(card.id, changes);
            }}
          />
        )}
      </Show>
      <Show when={projectEditorOpen()}>
        <ProjectEditor
          project={editingProject()}
          onClose={closeProjectEditor}
          onCreate={(title) => {
            const projectId = model().createProject({ title });
            setSelectedProject(projectId);
          }}
          onDelete={(project) => {
            setSelectedProject(undefined);
            model().deleteProject(project.id);
          }}
          onUpdate={(project, title) => {
            model().renameProject(project.id, title);
          }}
        />
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
