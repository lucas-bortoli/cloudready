import { createSignal, onCleanup, type Accessor } from "solid-js";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { openPackage, releasePackage, type LoadedPackage } from "../browser/session";

/**

 * Read-only import state and actions for a single Flashcards window.

 */
export interface PackageController {
  readonly loaded: Accessor<LoadedPackage | undefined>;
  readonly busy: Accessor<boolean>;
  readonly error: Accessor<string>;
  /**
   * Opens a file selected from the device.
   */
  openDevice(file: File): Promise<void>;
  /**
   * Opens a file from the active profile's filesystem.
   */
  openFile(path: string, name: string): Promise<void>;
  /**
   * Cancels this window's pending import.
   */
  cancel(): void;
}

/**
 * Owns the window's package reference and pending request. Must be created in
 * a Solid owner so disposal cancels outstanding work and releases that reference.
 */
export function createPackageController(userId: string): PackageController {
  const [loaded, setLoaded] = createSignal<LoadedPackage>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let request: AbortController | undefined;

  const cancel = (): void => {
    request?.abort();
    setBusy(false);
  };

  const load = async (name: string, read: () => Promise<ArrayBuffer>): Promise<void> => {
    request?.abort();
    const current = new AbortController();
    request = current;
    setBusy(true);
    setError("");
    try {
      const bytes = await read();
      if (current.signal.aborted) {
        return;
      }
      const result = await openPackage(userId, name, bytes, current.signal);
      // A cancelled import may still finish acquiring a shared package reference.
      if (current.signal.aborted) {
        releasePackage(userId, result.hash);
        return;
      }
      const previous = loaded();
      if (previous) {
        releasePackage(userId, previous.hash);
      }
      // A reopened cached package is still a new review session for this window.
      setLoaded({ ...result });
    } catch (cause) {
      if (!current.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not open the deck.");
      }
    } finally {
      if (request === current) {
        setBusy(false);
      }
    }
  };

  const openDevice = async (file: File): Promise<void> => {
    await load(file.name, () => {
      return file.arrayBuffer();
    });
  };

  const openFile = async (path: string, name: string): Promise<void> => {
    await load(name, async () => {
      const file = await filesystem.readFile(path);
      return file.arrayBuffer();
    });
  };

  onCleanup(() => {
    request?.abort();
    const current = loaded();
    if (current) {
      releasePackage(userId, current.hash);
    }
  });

  return { loaded, busy, error, openDevice, openFile, cancel };
}
