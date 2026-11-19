import { createSignal, onCleanup } from "solid-js";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { openSubjectPackage } from "../core/subject-package/package";
import type { OpenSubjectPackage } from "../core/subject-package/types";

/**
 * Manages open subjects within a Solid owner. Disposing the owner cancels
 * pending work and closes the packages.
 *
 * @returns Reactive subject, selection, loading and error state, plus open actions.
 */
export function createSubjectController() {
  const [subject, setSubject] = createSignal<OpenSubjectPackage>();
  const [subjects, setSubjects] = createSignal<
    ReadonlyArray<{ path: string; subject: OpenSubjectPackage }>
  >([]);
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
      const previous = subjects().find((entry) => entry.path === path);
      setSubjects((entries) => [
        ...entries.filter((entry) => entry.path !== path),
        { path, subject: opened },
      ]);
      setSubject(opened);
      setSelection(null);
      if (previous) await previous.subject.close();
    } catch (cause) {
      if (!current.signal.aborted && !disposed) {
        console.error("Could not open subject package.", cause);
        setError(cause instanceof Error ? cause.message : "Could not open subject.");
      }
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
    subjects().forEach((entry) => void entry.subject.close());
  });

  return {
    subject,
    subjects,
    selection,
    setSelection,
    loading,
    error,
    clearError: () => setError(""),
    openFile,
  };
}
