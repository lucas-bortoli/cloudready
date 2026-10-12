import Edit16 from "@carbon/icons/es/edit/16.js";
import FolderAdd16 from "@carbon/icons/es/folder--add/16.js";
import TaskAdd16 from "@carbon/icons/es/task--add/16.js";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";
import Button from "../../components/button/Button";
import Dropdown from "../../components/dropdown/Dropdown";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import useWindowCloser from "../../components/window-manager/useWindowCloser";
import CardEditor from "./components/CardEditor";
import Category from "./components/Category";
import ProjectEditor from "./components/ProjectEditor";
import TagEditor from "./components/TagEditor";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";
import useCardDrag from "./lib/useCardDrag";
import type { Bucket, Card as CardData, CardId, Model, Project, ProjectId } from "./model/model";
import { KodekaiStore } from "./model/persistence";

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
  const [tagEditorOpen, setTagEditorOpen] = createSignal(false);
  let focusReturnTarget: HTMLElement | undefined;
  let focusReturnCardId: CardId | undefined;
  let projectFocusReturnTarget: HTMLElement | undefined;
  const projects = createMemo(() => model().listProjects());
  const tags = createMemo(() => (selectedProject() ? model().listTags(selectedProject()!) : []));
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

  const openSelectedProjectEditor: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    const projectId = selectedProject();
    if (projectId) openProjectEditor(model().getProject(projectId), event.currentTarget);
  };

  const openNewProjectEditor: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) =>
    openProjectEditor(undefined, event.currentTarget);
  const openNewCardEditor = () => openEditor();
  const createCard = (card: Omit<CardData, "id" | "displayIndex">) => model().createCard(card);
  const deleteCard = (card: CardData) => model().deleteCard(card.id);
  const updateCard = (card: CardData, changes: Parameters<Model["updateCard"]>[1]) =>
    model().updateCard(card.id, changes);
  const createProject = (title: string) => {
    const projectId = model().createProject({ title });
    setSelectedProject(projectId);
  };
  const deleteProject = (project: Project) => {
    setSelectedProject(undefined);
    model().deleteProject(project.id);
  };
  const updateProject = (project: Project, title: string) =>
    model().renameProject(project.id, title);
  const createTag = (name: string) => model().createTag(selectedProject()!, name);
  const renameTag = (id: Parameters<Model["renameTag"]>[0], name: string) =>
    model().renameTag(id, name);
  const deleteTag = (id: Parameters<Model["deleteTag"]>[0]) => model().deleteTag(id);
  const openTagEditor = () => setTagEditorOpen(true);
  const closeTagEditor = () => setTagEditorOpen(false);

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
          onClick={openSelectedProjectEditor}
          startIcon={<CarbonIcon icon={Edit16} />}
        />
        <Button
          class="ml-1 px-2!"
          title="New Project..."
          onClick={openNewProjectEditor}
          startIcon={<CarbonIcon icon={FolderAdd16} />}
        />
        <Button
          class="ml-4 px-2!"
          disabled={!selectedProject()}
          title="New Card..."
          onClick={openNewCardEditor}
          startIcon={<CarbonIcon icon={TaskAdd16} />}
        />
        <Button class="ml-2" disabled={!selectedProject()} onClick={openTagEditor}>
          Tags
        </Button>
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
            tags={tags()}
            onClose={closeEditor}
            onCreate={createCard}
            onDelete={deleteCard}
            onUpdate={updateCard}
          />
        )}
      </Show>
      <Show when={tagEditorOpen() && selectedProject()}>
        <TagEditor
          tags={tags()}
          onClose={closeTagEditor}
          onCreate={createTag}
          onRename={renameTag}
          onDelete={deleteTag}
        />
      </Show>
      <Show when={projectEditorOpen()}>
        <ProjectEditor
          project={editingProject()}
          onClose={closeProjectEditor}
          onCreate={createProject}
          onDelete={deleteProject}
          onUpdate={updateProject}
        />
      </Show>
    </section>
  );
}

/** Optional model override for controlled rendering and integration tests. */
export interface KodekaiProps {
  model?: Model;
  userId?: string;
}

/** Provides and renders the Kodekai project board. */
export default function Kodekai(props: KodekaiProps) {
  useWindowCloser(() => true);
  const [store, setStore] = createSignal<KodekaiStore>();
  const [loadError, setLoadError] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal<{ dirty: boolean; error: unknown }>({
    dirty: false,
    error: undefined,
  });
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  const load = async () => {
    if (!props.userId) return;
    setLoadError(false);
    try {
      const loaded = await KodekaiStore.open(props.userId);
      if (disposed) return;
      unsubscribe?.();
      unsubscribe = loaded.subscribe(() => setSaveStatus(loaded.getStatus()));
      setSaveStatus(loaded.getStatus());
      setStore(loaded);
    } catch {
      if (!disposed) setLoadError(true);
    }
  };

  onMount(() => void load());
  onCleanup(() => {
    disposed = true;
    unsubscribe?.();
  });
  const retrySave = () => void store()?.save();
  const retryLoad = () => void load();
  const model = () => props.model ?? store()?.model;

  return (
    <Show
      when={model()}
      fallback={
        <div class="p-8">
          {loadError() ? "Could not load Kodekai." : "Loading Kodekai…"}
          <Show when={loadError()}>
            <Button onClick={retryLoad}>Retry</Button>
          </Show>
        </div>
      }
    >
      {(loadedModel) => (
        <KodekaiProvider model={loadedModel()}>
          <KodekaiView />
          <Show when={saveStatus().error}>
            <div role="alert" class="absolute right-4 bottom-4 z-40 rounded bg-red-100 p-3">
              Could not save Kodekai changes. <Button onClick={retrySave}>Retry</Button>
            </div>
          </Show>
        </KodekaiProvider>
      )}
    </Show>
  );
}
