import { createSignal, onCleanup } from "solid-js";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { openSubjectPackage } from "../core/subject-package/package";
import type { OpenSubjectPackage } from "../core/subject-package/types";

/**
 * Manages one open subject within a Solid owner. Disposing the owner cancels
 * pending work and closes the current package.
 *
 * @returns Reactive subject, selection, loading and error state, plus open actions.
 */
export function createSubjectController() {
  const [subject, setSubject] = createSignal<OpenSubjectPackage>();
  const [selection, setSelection] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  let request: AbortController | undefined;
  let disposed = false;

  /**
   * Opens a filesystem subject and retains the previous subject on failure.
   * Errors are exposed in the reactive error state.
   *
   * @param path CloudReady filesystem path to a LAP package.
   */
  async function openFile(path: string): Promise<void> {
    request?.abort();
    const current = new AbortController();
    request = current;
    setLoading(true);
    setError("");
    try {
      const blob = await filesystem.readFile(path);
      if (current.signal.aborted) return;
      const opened = await openSubjectPackage(blob, { signal: current.signal });
      if (current.signal.aborted || disposed) {
        await opened.close();
        return;
      }
      const previous = subject();
      setSubject(opened);
      setSelection(null);
      if (previous) await previous.close();
    } catch (cause) {
      if (!current.signal.aborted && !disposed)
        setError(cause instanceof Error ? cause.message : "Could not open subject.");
    } finally {
      if (request === current) {
        request = undefined;
        setLoading(false);
      }
    }
  }

  onCleanup(() => {
    disposed = true;
    request?.abort();
    const current = subject();
    if (current) void current.close();
  });
  return {
    subject,
    selection,
    setSelection,
    loading,
    error,
    clearError: () => setError(""),
    openFile,
  };
}
