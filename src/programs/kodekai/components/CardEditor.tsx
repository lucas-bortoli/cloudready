import Checkmark16 from "@carbon/icons/es/checkmark/16.js";
import Close16 from "@carbon/icons/es/close/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import Button from "../../../components/button/Button";
import DatePicker from "../../../components/date-picker/DatePicker";
import Dropdown from "../../../components/dropdown/Dropdown";
import CarbonIcon from "../../../components/taskbar/CarbonIcon";
import TextInput from "../../../components/text-input/TextInput";
import focusTrap from "../../../lib/focus-trap";
import { formatIsoDateTime, parseIsoDateTime } from "../../../lib/iso-date-time";
import type { Card as CardData, CardId, Priority, ProjectId } from "../model/model";

const exitDurationMs = 180;

export interface CardEditorProps {
  card?: CardData;
  projectId: ProjectId;
  onClose: (focusCardId?: CardId) => void;
  onCreate: (card: Omit<CardData, "id" | "displayIndex">) => CardId | undefined;
  onDelete: (card: CardData) => void;
  onUpdate: (
    card: CardData,
    changes: Pick<CardData, "title" | "content" | "priority" | "expiration">,
  ) => void;
}

function localDateValue(expiration: string) {
  const date = new Date(expiration);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Edits a Kodekai card in an overlay contained by the board window. */
export default function CardEditor(props: CardEditorProps) {
  let titleInput: HTMLTextAreaElement | undefined;
  const today = localDateValue(formatIsoDateTime(new Date()));
  const [title, setTitle] = createSignal("");
  const [content, setContent] = createSignal("");
  const [priority, setPriority] = createSignal<Priority>("normal");
  const [expirationDate, setExpirationDate] = createSignal(today);
  const [isClosing, setIsClosing] = createSignal(false);
  let closeTimer: number | undefined;

  const isDirty = () =>
    title() !== (props.card?.title ?? "") ||
    content() !== (props.card?.content ?? "") ||
    priority() !== (props.card?.priority ?? "normal") ||
    expirationDate() !== (props.card ? localDateValue(props.card.expiration) : today);

  const closeAfterTransition = (focusCardId?: CardId) => {
    if (isClosing()) return;
    setIsClosing(true);
    closeTimer = window.setTimeout(() => props.onClose(focusCardId), exitDurationMs);
  };

  const requestClose = () => {
    if (!isDirty() || window.confirm("Descartar as alterações não salvas?")) closeAfterTransition();
  };

  const deleteCard = () => {
    if (!props.card || !window.confirm("Excluir este cartão?")) return;
    props.onDelete(props.card);
    closeAfterTransition();
  };

  createEffect(() => {
    const card = props.card;
    setTitle(card?.title ?? "");
    setContent(card?.content ?? "");
    setPriority(card?.priority ?? "normal");
    setExpirationDate(card ? localDateValue(card.expiration) : today);
  });

  onMount(() => titleInput?.focus());
  onCleanup(() => {
    if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  });

  const save = (event: SubmitEvent) => {
    event.preventDefault();
    const cleanTitle = title().trim();
    if (!cleanTitle || !expirationDate()) return;
    const expiration = parseIsoDateTime(
      formatIsoDateTime(new Date(`${expirationDate()}T12:00:00`)),
    );

    if (props.card) {
      props.onUpdate(props.card, {
        title: cleanTitle,
        content: content(),
        priority: priority(),
        expiration,
      });
      closeAfterTransition();
    } else {
      const cardId = props.onCreate({
        projectId: props.projectId,
        title: cleanTitle,
        content: content(),
        priority: priority(),
        expiration,
        bucket: "icebox",
      });
      closeAfterTransition(cardId);
    }
  };

  return (
    <div
      x-role="kodekai card editor backdrop"
      class="kodekai-editor-backdrop absolute inset-0 z-30 flex items-center justify-center overflow-auto bg-neutral-900/35 p-4"
      classList={{ "kodekai-editor-closing": isClosing() }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        aria-labelledby="kodekai-card-editor-title"
        aria-modal="true"
        class="kodekai-editor-dialog w-full max-w-lg rounded border border-neutral-400 bg-white p-5 shadow-xl"
        classList={{ "kodekai-editor-closing": isClosing() }}
        x-role="kodekai card editor"
        role="dialog"
        use:focusTrap={focusTrap}
        onKeyDown={(event) => {
          if (event.key === "Escape") requestClose();
        }}
      >
        <h2 class="mb-4 text-lg font-semibold" id="kodekai-card-editor-title">
          {props.card ? "Editar cartão" : "Novo cartão"}
        </h2>
        <form class="flex flex-col gap-3" onSubmit={save}>
          <label class="flex flex-col gap-1">
            <span>Título</span>
            <TextInput ref={titleInput} onValueChange={setTitle} required value={title()} />
          </label>
          <label class="flex flex-col gap-1">
            <span>Descrição</span>
            <TextInput multiLine onValueChange={setContent} rows={4} value={content()} />
          </label>
          <div class="flex gap-2">
            <label class="flex shrink grow basis-0 flex-col gap-1">
              <span>Prioridade</span>
              <Dropdown
                options={[
                  { value: "low", label: "Baixa" },
                  { value: "normal", label: "Normal" },
                  { value: "urgent", label: "Urgente" },
                ]}
                value={priority()}
                onValueChange={(value) => setPriority(value as Priority)}
              />
            </label>
            <label class="flex shrink grow basis-0 flex-col gap-1">
              <span>Data de vencimento</span>
              <DatePicker required value={expirationDate()} onValueChange={setExpirationDate} />
            </label>
          </div>
          <Show when={!title().trim()}>
            <p class="text-sm text-red-700" role="alert">
              Informe um título para salvar.
            </p>
          </Show>
          <footer class="mt-2 flex items-center justify-end gap-2">
            <Show when={props.card}>
              <Button
                class="mr-auto"
                onClick={deleteCard}
                startIcon={<CarbonIcon icon={TrashCan16} />}
                variant="danger"
              >
                Excluir cartão
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
