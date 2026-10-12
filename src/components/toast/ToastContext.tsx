import {
  createContext,
  createSignal,
  For,
  onCleanup,
  useContext,
  type ParentProps,
} from "solid-js";
import generateUuid from "../../lib/uuid";
import { useLayerItem } from "../layer-manager/LayerContext";

export type ToastKind = "info" | "success" | "warning" | "error";

/** Options used to display a transient desktop notification. */
export interface ToastShowOptions {
  kind?: ToastKind;
  title: string;
  message?: string;
  durationMs?: number;
}

/** Thrown when a toast hook is used without a surrounding provider. */
export class ToastContextError extends Error {
  public constructor() {
    super("ToastProvider is missing.");
    this.name = "ToastContextError";
  }
}

type ToastId = ReturnType<typeof generateUuid<"ToastId">>;

interface Toast {
  id: ToastId;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  showToast: (options: ToastShowOptions) => () => void;
}

const ToastContext = createContext<ToastApi>();
const defaultDurationMs = 5_000;

/** Renders the global stack of transient desktop notifications. */
function ToastOutlet(props: { toasts: () => readonly Toast[]; dismiss: (id: ToastId) => void }) {
  const layerItem = useLayerItem("toasts");

  const handleDismissClick = (id: ToastId) => props.dismiss(id);

  return (
    <section
      x-role="toast outlet"
      aria-live="polite"
      class="pointer-events-none fixed right-4 bottom-4 flex w-80 flex-col gap-2"
      style={{ "z-index": layerItem.zIndex() }}
    >
      <For each={props.toasts()}>
        {(toast) => (
          <article
            x-role="toast"
            class="pointer-events-auto rounded-xs border border-neutral-400 bg-white p-3 text-neutral-700 shadow-xl"
            data-kind={toast.kind}
            role="status"
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 grow">
                <h2 class="font-medium">{toast.title}</h2>
                <p class="mt-1 text-neutral-600">{toast.message}</p>
              </div>
              <button
                aria-label="Dismiss notification"
                class="cursor-pointer rounded-xs px-1 outline-sky-200 hover:bg-neutral-100 focus:outline-2 focus:outline-offset-2"
                type="button"
                onClick={handleDismissClick.bind(null, toast.id)}
              >
                ×
              </button>
            </div>
          </article>
        )}
      </For>
    </section>
  );
}

/** Provides the desktop-wide API and outlet for transient notifications. */
export function ToastProvider(props: ParentProps) {
  const [toasts, setToasts] = createSignal<readonly Toast[]>([]);
  const dismissalTimers = new Map<ToastId, ReturnType<typeof setTimeout>>();

  const dismiss = (id: ToastId) => {
    const timer = dismissalTimers.get(id);
    if (timer) clearTimeout(timer);
    dismissalTimers.delete(id);
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  };

  const showToast = (options: ToastShowOptions) => {
    const id = generateUuid<"ToastId">();
    setToasts((currentToasts) => [
      ...currentToasts,
      {
        id,
        kind: options.kind ?? "info",
        title: options.title,
        message: options.message,
      },
    ]);

    const durationMs = options.durationMs ?? defaultDurationMs;
    if (durationMs > 0) dismissalTimers.set(id, setTimeout(dismiss.bind(null, id), durationMs));

    return dismiss.bind(null, id);
  };

  onCleanup(() => dismissalTimers.forEach(clearTimeout));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {props.children}
      <ToastOutlet dismiss={dismiss} toasts={toasts} />
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast API supplied by the nearest provider.
 *
 * @throws {ToastContextError} When called outside a provider.
 */
export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new ToastContextError();
  return toast;
}
