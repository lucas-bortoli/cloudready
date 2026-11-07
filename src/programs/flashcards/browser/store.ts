import { filesystem } from "../../../filesystem/FileSystemClient";
import {
  FileSystemEntryConflictError,
  FileSystemEntryNotFoundError,
} from "../../../filesystem/errors";
import type { AnkiCard } from "../core/anki";
import type { Rating } from "../core/fsrs";
import { emptyProgress, parseProgress, rateCard, type Progress } from "../core/progress";

const directory = "/Applications/Flashcards";
const stores = new Map<string, Promise<ProgressStore>>();

/** Shares pending writes and progress across app windows in this browser session. */
export class ProgressStore {
  public progress: Progress;
  public busy = false;
  public error: unknown;
  private lastUndo: Progress | undefined;
  private readonly listeners = new Set<() => void>();
  private constructor(progress: Progress) {
    this.progress = progress;
  }

  /**
   * Loads progress before review, preserving failures instead of replacing corrupt data.
   *
   * @throws {ProgressFormatError} If saved progress is invalid or too new.
   * @throws {FileSystemNetworkError} If the profile filesystem is unavailable.
   * @throws {FileSystemServerError} If the filesystem rejects the request.
   */
  public static open(userId: string, hash: string, name: string): Promise<ProgressStore> {
    const key = `${userId}:${hash}`;
    let pending = stores.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          return new ProgressStore(
            parseProgress(
              await (await filesystem.readFile(`${directory}/${hash}.json`)).text(),
              hash,
            ),
          );
        } catch (error) {
          if (error instanceof FileSystemEntryNotFoundError)
            return new ProgressStore(
              emptyProgress(hash, name, Intl.DateTimeFormat().resolvedOptions().timeZone),
            );
          throw error;
        }
      })().catch((error: unknown) => {
        stores.delete(key);
        throw error;
      });
      stores.set(key, pending);
    }
    return pending;
  }
  /** Subscribes to progress and save status changes. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
  /**
   * Rates a card and persists it before another rating can be accepted.
   *
   * @throws {SchedulerInputError} If the card or rating is invalid.
   */
  public async rate(card: AnkiCard, rating: Rating): Promise<void> {
    if (this.busy || this.error) return;
    const previous = this.progress;
    const next = rateCard(previous, card, rating, Date.now(), crypto.randomUUID()).progress;
    this.lastUndo = previous;
    this.progress = next;
    await this.save();
  }
  /** Undoes the latest successful session rating and persists the restored snapshot. */
  public async undo(): Promise<void> {
    if (this.busy || this.error || !this.lastUndo) return;
    // A settings change after the rating should survive undo.
    this.progress = { ...this.lastUndo, dailyLimit: this.progress.dailyLimit };
    this.lastUndo = undefined;
    await this.save();
  }
  /** Reports whether this session has an undoable rating. */
  public canUndo(): boolean {
    return this.lastUndo !== undefined;
  }
  /** Saves a per-deck new-card limit. */
  public async setLimit(deckId: string, limit: number): Promise<void> {
    if (this.busy || this.error || !Number.isInteger(limit) || limit < 0 || limit > 9999) return;
    this.progress = {
      ...this.progress,
      dailyLimit: { ...this.progress.dailyLimit, [deckId]: limit },
    };
    await this.save();
  }
  /** Retries the exact pending snapshot after an I/O failure. */
  public async save(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = undefined;
    this.notify();
    try {
      for (const path of ["/Applications", directory]) {
        try {
          await filesystem.createDirectory(path);
        } catch (error) {
          if (!(error instanceof FileSystemEntryConflictError)) throw error;
        }
      }
      const path = `${directory}/${this.progress.packageHash}.json`;
      try {
        await filesystem.createFile(path);
      } catch (error) {
        if (!(error instanceof FileSystemEntryConflictError)) throw error;
      }
      // A single in-flight snapshot prevents an earlier response from overwriting a later rating.
      await filesystem.writeFile(
        path,
        new Blob([JSON.stringify(this.progress)], { type: "application/json" }),
      );
    } catch (error) {
      this.error = error;
    } finally {
      this.busy = false;
      this.notify();
    }
  }
}
