import type { JSX } from "@solidjs/web";
import { createMemo, For, onCleanup, onSettled } from "solid-js";
import Deferred from "../../lib/deferred";
import type { Size2d } from "../../lib/math";
import generateUuid from "../../lib/uuid";
import Button from "../button/Button";
import { useCurrentWindowId } from "../window-manager/CurrentWindowContext";
import type { WindowId } from "../window-manager/WindowManager";
import WindowManager from "../window-manager/WindowManager";
import { useWindowManager } from "../window-manager/WindowManagerContext";
import iconError from "./DialogError32.png";
import iconInfo from "./DialogInfo32.png";
import iconQuestion from "./DialogQuestion32.png";
import iconWarning from "./DialogWarning32.png";

export type DialogIcon = "error" | "warning" | "question" | "info";

/** Options used to create and show a dialog. */
export interface DialogShowOptions<A extends string> {
  icon: DialogIcon;
  /** Text displayed in the dialog window's title bar. */
  title: string;
  /** Lazily renders the dialog body. */
  content: () => JSX.Element;
  /** Maps result values to the labels shown on the dialog's action buttons. */
  actions: Record<A, string>;
}

/** Generates a stable identifier for a displayed dialog. */
const makeDialogId = () => generateUuid<"DialogId">();

/** A stable identifier for a displayed dialog. */
type DialogId = ReturnType<typeof makeDialogId>;

/** Tracks the window and deferred result for one displayed dialog. */
interface DialogInstance {
  /** Stable identifier for this dialog. */
  id: DialogId;
  /** Identifier of the window rendering this dialog. */
  windowId: WindowId;
  /** Deferred result resolved by an action or rejected when cancelled. */
  deferred: Deferred<string, RejectReasonDialogCancelled>;
}

/** Stable rejection reason used when a dialog is cancelled. */
export const RejectReasonDialogCancelled = "reject-reason:DialogCancelled" as const;

/** The type of {@link RejectReasonDialogCancelled}. */
export type RejectReasonDialogCancelled = typeof RejectReasonDialogCancelled;

export interface DialogHandle<R> {
  exists: () => boolean;
  emphasize: () => void;
  result: Promise<R>;
}

/** No dialog for this operation. */
export class DialogMissingError extends Error {
  constructor(id: DialogId) {
    super(`The dialog ${id} doesn't exist`);
  }
}

const DIALOG_WIDTH = 400;

/** Properties accepted by {@link DialogContentWrapper}. */
interface DialogContentWrapperProps {
  icon: DialogIcon;
  /** Text displayed in the dialog window's title bar. */
  title: string;
  /** Lazily renders the dialog body. */
  content: () => JSX.Element;
  /** Maps result values to the labels shown on the dialog's action buttons. */
  actions: Record<string, string>;
  /** Receives the result value of a clicked action button. */
  onActionClicked: (action: string) => void;
}

/** Renders a dialog's body and its available action buttons. */
function DialogContentWrapper(props: DialogContentWrapperProps) {
  let mainRef: HTMLElement | undefined;
  let footerRef: HTMLElement | undefined;

  const windowManager = useWindowManager();
  const windowId = useCurrentWindowId();
  onSettled(() => {
    const frame = requestAnimationFrame(() => {
      if (!mainRef || !footerRef || !mainRef.parentElement) return;

      const size: Size2d = {
        width: DIALOG_WIDTH,
        height: footerRef.scrollHeight + mainRef.scrollHeight,
      };
      windowManager.setSize(windowId, size);
    });
    return () => cancelAnimationFrame(frame);
  });

  const imageUrl = createMemo(() => {
    if (props.icon === "error") {
      return iconError;
    } else if (props.icon === "warning") {
      return iconWarning;
    } else if (props.icon === "question") {
      return iconQuestion;
    } else {
      return iconInfo;
    }
  });

  return (
    <div
      x-role="dialog content wrapper"
      class="grid h-full w-full grid-cols-[64px_1fr] grid-rows-[1fr_auto] flex-col overflow-hidden"
    >
      <img src={imageUrl()} class="pointer-events-none m-4 inline-block size-8" />
      <main class="shrink grow basis-0 overflow-y-auto p-4" ref={mainRef}>
        {props.content()}
      </main>
      <footer class="col-span-2 flex justify-end gap-1 bg-neutral-50 p-1" ref={footerRef}>
        <For
          each={Object.keys(props.actions)}
          children={(actionKey) => (
            <Button onClick={props.onActionClicked.bind(null, actionKey)}>
              {props.actions[actionKey]}
            </Button>
          )}
        />
      </footer>
    </div>
  );
}

/**
 * Returns a function that opens a pinned dialog window.
 *
 * The returned promise resolves with an action key or rejects with
 * {@link RejectReasonDialogCancelled} when the dialog is cancelled.
 */
export default function useDialog() {
  const windowManager: WindowManager = useWindowManager();
  const dialogs = new Map<DialogId, DialogInstance>();

  /** Resolves a dialog with its selected action and removes its window. */
  function handleConfirm(id: DialogId, action: string) {
    const dialog = dialogs.get(id);
    if (!dialog) throw new DialogMissingError(id);
    dialog.deferred.resolve(action);
    windowManager.destroyWindow(dialog.windowId);
    dialogs.delete(id);
  }

  /** Rejects a dialog as cancelled, removes its window, and clears its state. */
  function handleCancel(id: DialogId) {
    const dialog = dialogs.get(id);
    if (!dialog) throw new DialogMissingError(id);
    dialog.deferred.reject(RejectReasonDialogCancelled);
    windowManager.destroyWindow(dialog.windowId);
    dialogs.delete(id);
  }

  function handleHandleEmphasize(id: DialogId) {
    const dialog = dialogs.get(id);
    if (!dialog) throw new DialogMissingError(id);
    if (!windowManager.getWindows().some((window) => window.id === dialog.windowId)) {
      // Creation is scheduled; keep the request until the window can be addressed.
      queueMicrotask(() => {
        if (!dialogs.has(id)) return;
        windowManager.setPinned(dialog.windowId, true);
        windowManager.bringToTop(dialog.windowId);
      });
      return;
    }
    windowManager.setPinned(dialog.windowId, true);
    windowManager.bringToTop(dialog.windowId);
  }

  function handleHandleExists(id: DialogId) {
    return dialogs.has(id);
  }

  /** Opens a pinned dialog window and returns its eventual selected action. */
  function create<A extends string>(options: DialogShowOptions<A>): DialogHandle<A> {
    const id = makeDialogId();
    const windowId = windowManager.createWindow({
      title: options.title,
      isMinimized: false,
      isPinned: true,
      // zero initial height; dialog is autosized
      size: { width: DIALOG_WIDTH, height: 0 },
      minimumSize: { width: DIALOG_WIDTH, height: 0 },
      isResizable: false,
      isMinimizable: false,
      content: () => (
        <DialogContentWrapper
          icon={options.icon}
          title={options.title}
          content={options.content}
          actions={options.actions}
          onActionClicked={handleConfirm.bind(null, id)}
        />
      ),
      closer: () => {
        handleCancel(id);
        return true;
      },
    });

    const deferred = new Deferred<string, RejectReasonDialogCancelled>();

    dialogs.set(id, {
      id,
      windowId,
      deferred,
    });

    return {
      exists: handleHandleExists.bind(null, id),
      emphasize: handleHandleEmphasize.bind(null, id),
      result: deferred.promise as Promise<A>,
    };
  }

  onCleanup(() => {
    dialogs.forEach((dialog) => {
      // Cleanup may run during settlement, when flushing window updates is not reentrant.
      queueMicrotask(() => windowManager.finishDestroyWindow(dialog.windowId));
      dialog.deferred.reject(RejectReasonDialogCancelled);
      dialogs.delete(dialog.id);
    });
  });

  return create;
}
