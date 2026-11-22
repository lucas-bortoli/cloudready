import { createMemo, createSignal, onCleanup } from "solid-js";
import Button from "../../../components/button/Button";
import type { WindowId } from "../../../components/window-manager/WindowManager";
import { useWindowManager } from "../../../components/window-manager/WindowManagerContext";
import type { FileSystemEntry } from "../../../filesystem/FileSystemClient";
import Deferred, { type PromiseTagged } from "../../../lib/deferred";
import BrowserPanel from "../components/BrowserPanel";
import createNavigationController from "../navigation-controller";

/** Determines whether the picker selects files or a directory. */
export type Mode =
  | {
      type: "file";
      suffixes: string[];
      multiple: boolean;
    }
  | { type: "directory" };

/** No file picker exists for this operation. */
export class FilePickerMissingError extends Error {
  constructor() {
    super("The file picker doesn't exist");
  }
}

/** A file picker already exists for this operation. */
export class FilePickerExistsError extends Error {
  constructor() {
    super("The file picker already exists");
  }
}

/** The file picker for this operation was cancelled. */
export class FilePickerCancelledError extends Error {
  constructor() {
    super("The file picker was cancelled");
  }
}

/** Properties accepted by {@link Picker}. */
interface PickerProps {
  mode: Mode;
  /** Receives the selected filesystem entries. */
  onPick: (entries: FileSystemEntry[]) => void;
}

/** Renders the file picker content. */
function Picker(props: PickerProps) {
  /** Checks whether a file matches the picker's suffix restrictions. */
  function matchesFile(entry: FileSystemEntry) {
    const mode = props.mode;
    return (
      entry.kind === "file" &&
      mode.type === "file" &&
      (mode.suffixes.length === 0 ||
        mode.suffixes.some((suffix) => entry.name.toLowerCase().endsWith(suffix.toLowerCase())))
    );
  }

  const controller = createNavigationController({
    entryFilter: (entry) => entry.kind === "directory" || matchesFile(entry),
  });

  /** Selected entries that are currently visible in the browser. */
  const pickedEntries = createMemo(() =>
    controller.entries().filter((entry) => controller.selectedItems().has(entry.name)),
  );

  /** Checks whether the selection satisfies the picker's mode. */
  const canConfirm = createMemo(() => {
    const entries = pickedEntries();
    const mode = props.mode;
    if (entries.length === 0) return false;
    if (mode.type === "directory") return entries.length === 1 && entries[0].kind === "directory";
    if (!mode.multiple && entries.length !== 1) return false;
    return entries.every(matchesFile);
  });

  /** Confirms the selection only when it satisfies the current mode. */
  function handleConfirm() {
    if (canConfirm()) props.onPick(pickedEntries());
  }

  return (
    <div x-role="file picker content wrapper" class="flex h-full w-full flex-col overflow-hidden">
      <BrowserPanel controller={controller} />
      <footer class="flex justify-end border-t border-neutral-200 bg-neutral-100 p-1">
        <Button disabled={!canConfirm()} onClick={handleConfirm}>
          Confirm Selection
        </Button>
      </footer>
    </div>
  );
}

/** Tracks the window and deferred result for the current file picker. */
interface PickerInstance {
  mode: Mode;
  /** Identifier of the window rendering this file picker. */
  windowId: WindowId;
  /** Deferred selection resolved on confirmation or rejected on cancellation. */
  deferred: Deferred<FileSystemEntry[], FilePickerCancelledError>;
}

/**
 * Creates controls for opening a pinned file picker window.
 *
 * The picker promise resolves with selected entries or rejects with
 * {@link FilePickerCancelledError} when the picker is cancelled.
 *
 * @param mode Determines what the picker can select.
 */
export default function useFilePicker(mode: Mode) {
  const windowManager = useWindowManager();
  let current: PickerInstance | null = null;
  const [isOpen, setIsOpen] = createSignal(false);

  function closeWindow(windowId: WindowId) {
    if (!windowManager.destroyWindow(windowId)) {
      // A newly created window becomes visible to the manager after settlement.
      queueMicrotask(() => windowManager.destroyWindow(windowId));
    }
  }

  /** Resolves the file picker with its selected entries and removes its window. */
  function handleConfirm(entries: FileSystemEntry[]) {
    const _current = current;
    if (_current === null) throw new FilePickerMissingError();

    _current.deferred.resolve(entries);
    current = null;
    setIsOpen(false);
    closeWindow(_current.windowId);
  }

  /** Rejects the file picker as cancelled, removes its window, and clears its state. */
  function handleCancel() {
    const _current = current;
    if (_current === null) throw new FilePickerMissingError();

    _current.deferred.reject(new FilePickerCancelledError());
    current = null;
    setIsOpen(false);
    closeWindow(_current.windowId);
  }

  /**
   * Opens a pinned file picker window and returns its eventual selection.
   *
   * @throws {FilePickerCancelledError} The picker was cancelled.
   * @throws {FilePickerExistsError} A picker is already open.
   */
  function show(): PromiseTagged<
    FileSystemEntry[],
    FilePickerCancelledError | FilePickerExistsError
  > {
    const _current = current;
    if (_current !== null) {
      return Promise.reject(new FilePickerExistsError());
    }

    const deferred = new Deferred<FileSystemEntry[], FilePickerCancelledError>();

    const windowId = windowManager.createWindow({
      title: "Pick a file",
      size: { width: 640, height: 320 },
      minimumSize: { width: 480, height: 240 },
      isResizable: true,
      isMinimizable: false,
      isPinned: true,
      isMinimized: false,
      content: () => <Picker mode={mode} onPick={handleConfirm} />,
      closer: () => {
        handleCancel();
        return true;
      },
    });

    current = {
      mode,
      windowId,
      deferred,
    };
    setIsOpen(true);

    return deferred.promise;
  }

  onCleanup(() => {
    if (current) {
      handleCancel();
    }
  });

  return {
    show,
    isOpen,
  };
}
