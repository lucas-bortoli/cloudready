import { filesystem } from "../../../filesystem/FileSystemClient";
import {
  FileSystemEntryConflictError,
  FileSystemEntryNotFoundError,
} from "../../../filesystem/errors";
import { Model } from "./model";

const directory = "/Applications";
const path = `${directory}/Kodekai.json`;
const stores = new Map<string, Promise<KodekaiStore>>();

/** A shared, per-user Kodekai model with serialized filesystem writes. */
export class KodekaiStore {
  public readonly model: Model;
  private readonly listeners = new Set<() => void>();
  private timer: number | undefined;
  private writes: Promise<void> = Promise.resolve();
  private dirty = false;
  private error: unknown;

  private constructor(model: Model) {
    this.model = model;
    model.subscribe(() => {
      this.dirty = true;
      this.error = undefined;
      this.notify();
      if (this.timer !== undefined) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.save(), 300);
    });
  }

  /** Loads a user's board once so open windows edit the same model. */
  public static open(userId: string): Promise<KodekaiStore> {
    let pending = stores.get(userId);
    if (!pending) {
      pending = KodekaiStore.load().catch((error: unknown) => {
        stores.delete(userId);
        throw error;
      });
      stores.set(userId, pending);
    }
    return pending;
  }

  private static async load(): Promise<KodekaiStore> {
    try {
      const json = await (await filesystem.readFile(path)).text();
      return new KodekaiStore(Model.fromJSON(json));
    } catch (error) {
      if (error instanceof FileSystemEntryNotFoundError) return new KodekaiStore(Model.empty());
      throw error;
    }
  }

  /** Reports whether changes remain unsaved and the last write error, if any. */
  public getStatus(): { dirty: boolean; error: unknown } {
    return { dirty: this.dirty, error: this.error };
  }

  /** Observes save status changes. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Retries saving the latest model snapshot. */
  public async save(): Promise<void> {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
    const snapshot = this.model.toJSON();
    this.dirty = false;
    this.error = undefined;
    this.notify();

    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        try {
          await filesystem.createDirectory(directory);
        } catch (error) {
          if (!(error instanceof FileSystemEntryConflictError)) throw error;
        }
        try {
          await filesystem.createFile(path);
        } catch (error) {
          if (!(error instanceof FileSystemEntryConflictError)) throw error;
        }
        await filesystem.writeFile(path, new Blob([snapshot], { type: "application/json" }));
      });
    this.writes = write;
    try {
      await write;
    } catch (error) {
      this.dirty = true;
      this.error = error;
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
