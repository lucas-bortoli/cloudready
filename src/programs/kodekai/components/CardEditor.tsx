import { createEffect, createSignal, Show } from "solid-js";
import Button from "../../../components/button/Button";
import DatePicker from "../../../components/date-picker/DatePicker";
import Dropdown from "../../../components/dropdown/Dropdown";
import TextInput from "../../../components/text-input/TextInput";
import { formatIsoDateTime, parseIsoDateTime } from "../../../lib/iso-date-time";
import type { Card as CardData, Priority, ProjectId } from "../model/model";

export interface CardEditorProps {
  card?: CardData;
  projectId: ProjectId;
  onClose: () => void;
  onCreate: (card: Omit<CardData, "id" | "displayIndex">) => void;
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
  const today = localDateValue(formatIsoDateTime(new Date()));
  const [title, setTitle] = createSignal("");
  const [content, setContent] = createSignal("");
  const [priority, setPriority] = createSignal<Priority>("normal");
  const [expirationDate, setExpirationDate] = createSignal(today);

  createEffect(() => {
    const card = props.card;
    setTitle(card?.title ?? "");
    setContent(card?.content ?? "");
    setPriority(card?.priority ?? "normal");
    setExpirationDate(card ? localDateValue(card.expiration) : today);
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
    } else {
      props.onCreate({
        projectId: props.projectId,
        title: cleanTitle,
        content: content(),
        priority: priority(),
        expiration,
        bucket: "icebox",
      });
    }
  };

  return (
    <div
      x-role="kodekai card editor backdrop"
      class="absolute inset-0 z-30 flex items-center justify-center overflow-auto bg-neutral-900/35 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        aria-labelledby="kodekai-card-editor-title"
        aria-modal="true"
        class="w-full max-w-lg rounded border border-neutral-400 bg-white p-5 shadow-xl"
        x-role="kodekai card editor"
        role="dialog"
      >
        <h2 class="mb-4 text-lg font-semibold" id="kodekai-card-editor-title">
          {props.card ? "Editar cartão" : "Novo cartão"}
        </h2>
        <form class="flex flex-col gap-3" onSubmit={save}>
          <label class="flex flex-col gap-1">
            <span>Título</span>
            <TextInput autofocus onValueChange={setTitle} required value={title()} />
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
          <footer class="mt-2 flex justify-end gap-2">
            <Button onClick={props.onClose}>Cancelar</Button>
            <Button type="submit" variant="primary">
              Salvar
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
