import { createEffect, createMemo, createSignal, For } from "solid-js";
import Dropdown from "../../components/dropdown/Dropdown";
import Category from "./components/Category";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";
import useCardDrag from "./lib/useCardDrag";
import { createMockModel } from "./model/fixture";
import type { Bucket, Model, ProjectId } from "./model/model";

/** Renders the Kodekai board for the model supplied by its provider. */
function KodekaiView() {
  const model = useKodekai();
  const [selectedProject, setSelectedProject] = createSignal<ProjectId | undefined>(
    model().listProjects()[0]?.id,
  );
  const [rootElement, setRootElement] = createSignal<HTMLElement>();
  const projects = createMemo(() => model().listProjects());
  const cardDrag = useCardDrag({ model, rootElement });

  createEffect(() => {
    const selectedProjectId = selectedProject();
    if (projects().some((project) => project.id === selectedProjectId)) return;
    setSelectedProject(projects()[0]?.id);
  });

  return (
    <section
      x-role="kodekai"
      ref={setRootElement}
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
              draggingCardId={cardDrag.draggingCardId}
              indicator={cardDrag.dropTarget}
              onCardPointerDown={cardDrag.onCardPointerDown}
              onListElement={cardDrag.registerBucketList}
            />
          )}
        />
      </section>
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
