import Checkmark16 from "@carbon/icons/es/checkmark/16.js";
import Close16 from "@carbon/icons/es/close/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import Button from "../../../components/button/Button";
import CarbonIcon from "../../../components/taskbar/CarbonIcon";
import TextInput from "../../../components/text-input/TextInput";
import focusTrap from "../../../lib/focus-trap";
import type { Project } from "../model/model";

const exitDurationMs = 180;

export interface ProjectEditorProps {
  project?: Project;
  onClose: () => void;
  onCreate: (title: string) => void;
  onDelete: (project: Project) => void;
  onUpdate: (project: Project, title: string) => void;
}

/** Creates or edits a Kodekai project in an overlay contained by the board window. */
export default function ProjectEditor(props: ProjectEditorProps) {
  let titleInput: HTMLTextAreaElement | undefined;
  const [title, setTitle] = createSignal("");
  const [isClosing, setIsClosing] = createSignal(false);
  let closeTimer: number | undefined;

  const isDirty = () => title() !== (props.project?.title ?? "");

  const closeAfterTransition = () => {
    if (isClosing()) return;
    setIsClosing(true);
    closeTimer = window.setTimeout(props.onClose, exitDurationMs);
  };

  const requestClose = () => {
    if (!isDirty() || window.confirm("Descartar as alterações não salvas?")) closeAfterTransition();
  };

  const save = (event: SubmitEvent) => {
    event.preventDefault();
    const cleanTitle = title().trim();
    if (!cleanTitle) return;

    if (props.project) {
      props.onUpdate(props.project, cleanTitle);
    } else {
      props.onCreate(cleanTitle);
    }
    closeAfterTransition();
  };

  const deleteProject = () => {
    if (!props.project || !window.confirm("Excluir este projeto e todos os seus cartões?")) return;
    props.onDelete(props.project);
    closeAfterTransition();
  };

  createEffect(() => {
    setTitle(props.project?.title ?? "");
  });

  onMount(() => titleInput?.focus());
  onCleanup(() => {
    if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  });

  return (
    <div
      x-role="kodekai project editor backdrop"
      class="kodekai-editor-backdrop absolute inset-0 z-30 flex items-center justify-center overflow-auto bg-neutral-900/35 p-4"
      classList={{ "kodekai-editor-closing": isClosing() }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        aria-labelledby="kodekai-project-editor-title"
        aria-modal="true"
        class="kodekai-editor-dialog w-full max-w-md rounded border border-neutral-400 bg-white p-5 shadow-xl"
        classList={{ "kodekai-editor-closing": isClosing() }}
        x-role="kodekai project editor"
        role="dialog"
        use:focusTrap={focusTrap}
        onKeyDown={(event) => {
          if (event.key === "Escape") requestClose();
        }}
      >
        <h2 class="mb-4 text-lg font-semibold" id="kodekai-project-editor-title">
          {props.project ? "Editar projeto" : "Novo projeto"}
        </h2>
        <form class="flex flex-col gap-3" onSubmit={save}>
          <label class="flex flex-col gap-1">
            <span>Título</span>
            <TextInput ref={titleInput} onValueChange={setTitle} required value={title()} />
          </label>
          <Show when={!title().trim()}>
            <p class="text-sm text-red-700" role="alert">
              Informe um título para salvar.
            </p>
          </Show>
          <footer class="mt-2 flex items-center justify-end gap-2">
            <Show when={props.project}>
              <Button
                class="mr-auto"
                onClick={deleteProject}
                startIcon={<CarbonIcon icon={TrashCan16} />}
                variant="danger"
              >
                Excluir projeto
              </Button>
            </Show>
            <Button onClick={requestClose} startIcon={<CarbonIcon icon={Close16} />}>
              Cancelar
            </Button>
            <Button startIcon={<CarbonIcon icon={Checkmark16} />} type="submit" variant="primary">
              Salvar
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
