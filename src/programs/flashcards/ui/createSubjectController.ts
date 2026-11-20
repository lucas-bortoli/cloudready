import { batch, createSignal, onCleanup } from "solid-js";
import { filesystem } from "../../../filesystem/FileSystemClient";
import type { SubjectProgress } from "../core/learning-program";
import { emptySubjectProgress } from "../core/subject-review";
import { openSubjectPackage, writeSubjectPackage } from "../core/subject-package/package";
import type { OpenSubjectPackage } from "../core/subject-package/types";

/** Owns the draft and any save in flight for one open archive. */
function createSubjectEntry(path: string, subject: OpenSubjectPackage) {
  const initial =
    subject.progress ??
    emptySubjectProgress(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [progress, setProgress] = createSignal(initial);
  const [saved, setSaved] = createSignal(initial);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal("");
  let pending: Promise<void> | undefined;

  const dirty = () => progress() !== saved();

  const persist = async (snapshot: SubjectProgress): Promise<void> => {
    try {
      // Finish the archive before committing a new filesystem revision.
      const archive = new TransformStream<Uint8Array, Uint8Array>();
      const [blob] = await Promise.all([
        new Response(archive.readable).blob(),
        writeSubjectPackage({ ...subject, progress: snapshot }, archive.writable),
      ]);
      await filesystem.writeFile(path, blob);
      setSaved(snapshot);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save subject.";
      setSaveError(message);
    }
  };

  const save = (): Promise<void> => {
    if (pending) return pending;
    if (!dirty()) return Promise.resolve();
    const snapshot = progress();
    const operation = persist(snapshot).finally(() => {
      pending = undefined;
      setSaving(false);
    });
    pending = operation;
    batch(() => {
      setSaving(true);
      setSaveError("");
    });
    return operation;
  };

  const updateProgress = (next: SubjectProgress): void => {
    setProgress(next);
    if (!saving() && !dirty()) setSaveError("");
  };

  return {
    path,
    subject,
    progress,
    updateProgress,
    dirty,
    saving,
    saveError,
    save,
    pending: () => pending,
  };
}

/** The live archive and progress draft for an open subject. */
export type OpenSubjectEntry = ReturnType<typeof createSubjectEntry>;

// Windows in the same desktop share a draft, so saving from one cannot discard another's ratings.
const openEntries = new Map<string, { entry: OpenSubjectEntry; windows: number }>();
const storageKey = "flashcards.open-subjects";

function storedPaths(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(value))
      return [...new Set(value.filter((path): path is string => typeof path === "string"))];
  } catch {
    // Storage can be unavailable or contain invalid data.
  }
  return [];
}

function rememberPath(path: string): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...new Set([...storedPaths(), path])]));
  } catch {
    // Opening a subject should still work when storage is unavailable.
  }
}

function releaseSubject(entry: OpenSubjectEntry): void {
  const shared = openEntries.get(entry.path);
  if (!shared) return;
  shared.windows -= 1;
  if (shared.windows !== 0) return;

  const closeIfUnused = () => {
    if (shared.windows !== 0 || openEntries.get(entry.path) !== shared || entry.pending()) return;
    openEntries.delete(entry.path);
    void entry.subject.close();
  };

  // An explicit save can finish after the last window closes.
  const pending = entry.pending();
  if (pending) {
    void pending.then(closeIfUnused);
  } else {
    closeIfUnused();
  }
}

/**
 * Manages open subjects within a Solid owner. Disposing the owner cancels
 * pending opens and releases its archive references.
 *
 * @returns Reactive subject, selection, loading and error state, plus open actions.
 */
export function createSubjectController() {
  const [subject, setSubject] = createSignal<OpenSubjectPackage>();
  const [subjects, setSubjects] = createSignal<readonly OpenSubjectEntry[]>([]);
  const [selection, setSelection] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  let request: AbortController | undefined;
  let lifecycle: "restoring" | "active" | "disposed" = "restoring";

  /**
   * Opens a filesystem subject and retains the previous subject on failure.
   * Errors are exposed in the reactive error state.
   *
   * @param path CloudReady filesystem path to a LAP package.
   */
  async function openPath(path: string): Promise<void> {
    request?.abort();
    const current = new AbortController();
    request = current;
    setLoading(true);
    setError("");
    const existing = subjects().find((entry) => entry.path === path);
    if (existing) {
      request = undefined;
      setLoading(false);
      setSubject(existing.subject);
      setSelection(null);
      return;
    }
    try {
      let shared = openEntries.get(path);
      if (!shared) {
        const blob = await filesystem.readFile(path);
        if (current.signal.aborted) return;
        const opened = await openSubjectPackage(blob, { signal: current.signal });
        if (current.signal.aborted || lifecycle === "disposed") {
          await opened.close();
          return;
        }
        // Another window may have finished opening this path while we were reading it.
        shared = openEntries.get(path);
        if (shared) {
          void opened.close();
        } else {
          shared = { entry: createSubjectEntry(path, opened), windows: 0 };
          openEntries.set(path, shared);
        }
      }
      const { entry } = shared;
      shared.windows += 1;
      batch(() => {
        setSubjects((entries) => [...entries, entry]);
        setSubject(entry.subject);
        setSelection(null);
      });
      rememberPath(path);
    } catch (cause) {
      if (!current.signal.aborted && lifecycle !== "disposed") {
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

  async function openFile(path: string): Promise<void> {
    if (lifecycle === "disposed") return;
    lifecycle = "active";
    await openPath(path);
  }

  async function restoreSubjects(): Promise<void> {
    for (const path of storedPaths()) {
      if (lifecycle !== "restoring") return;
      await openPath(path);
    }
    if (lifecycle === "restoring") lifecycle = "active";
  }

  void restoreSubjects();

  onCleanup(() => {
    lifecycle = "disposed";
    request?.abort();
    subjects().forEach(releaseSubject);
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
