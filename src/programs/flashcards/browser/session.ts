import type { AnkiCollection } from "../core/anki";
import { ProgressStore } from "./store";

export interface LoadedPackage {
  hash: string;
  collection: AnkiCollection;
  store: ProgressStore;
}
/** A package could not be decoded or its import worker failed. */
export class PackageOpenError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PackageOpenError";
  }
}
/** A caller chose to stop waiting for a package. */
export class PackageCancelledError extends Error {
  public constructor() {
    super("Package opening was cancelled.");
    this.name = "PackageCancelledError";
  }
}
interface PackageEntry {
  promise: Promise<LoadedPackage>;
  controller: AbortController;
  waiters: number;
  references: number;
}
const packages = new Map<string, PackageEntry>();

function releaseIfUnused(key: string, entry: PackageEntry): void {
  if (entry.waiters === 0 && entry.references === 0) {
    entry.controller.abort();
    if (packages.get(key) === entry) packages.delete(key);
  }
}

/**
 * Loads one package per profile/hash in this browser session. A caller can
 * cancel independently; the worker is stopped only when no window needs it.
 * No package bytes are written into the profile filesystem.
 *
 * @throws {PackageCancelledError} If this caller cancels the operation.
 * @throws {PackageOpenError} If hashing, package decoding, or progress loading fails.
 */
export async function openPackage(
  userId: string,
  name: string,
  bytes: ArrayBuffer,
  signal: AbortSignal,
): Promise<LoadedPackage> {
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest("SHA-256", bytes);
  } catch (cause) {
    throw new PackageOpenError("Could not identify this package.", { cause });
  }
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  if (signal.aborted) throw new PackageCancelledError();
  const key = `${userId}:${hash}`;
  let entry = packages.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: PackageEntry = {
      controller,
      waiters: 0,
      references: 0,
      promise: Promise.resolve(undefined as never),
    };
    created.promise = (async () => {
      try {
        const store = await ProgressStore.open(userId, hash, name);
        if (controller.signal.aborted) throw new PackageCancelledError();
        const collection = await new Promise<AnkiCollection>((resolve, reject) => {
          const worker = new Worker(new URL("./import-worker.ts", import.meta.url), {
            type: "module",
          });
          const cancel = () => {
            worker.terminate();
            reject(new PackageCancelledError());
          };
          controller.signal.addEventListener("abort", cancel, { once: true });
          worker.onmessage = (
            event: MessageEvent<{ collection?: AnkiCollection; error?: string }>,
          ) => {
            controller.signal.removeEventListener("abort", cancel);
            worker.terminate();
            if (event.data.collection) resolve(event.data.collection);
            else reject(new PackageOpenError(event.data.error ?? "Could not read this package."));
          };
          worker.onerror = () => {
            controller.signal.removeEventListener("abort", cancel);
            worker.terminate();
            reject(new PackageOpenError("Package worker failed."));
          };
          worker.postMessage(bytes, [bytes]);
        });
        return { hash, collection, store };
      } catch (cause) {
        if (cause instanceof PackageCancelledError || cause instanceof PackageOpenError)
          throw cause;
        throw new PackageOpenError("Could not load package progress.", { cause });
      }
    })().catch((error: unknown) => {
      if (packages.get(key) === created) packages.delete(key);
      throw error;
    });
    entry = created;
    packages.set(key, entry);
  }
  entry.waiters++;
  let cancel: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(new PackageCancelledError());
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try {
    const loaded = await Promise.race([entry.promise, cancelled]);
    if (signal.aborted) throw new PackageCancelledError();
    entry.references++;
    return loaded;
  } finally {
    signal.removeEventListener("abort", cancel);
    entry.waiters--;
    releaseIfUnused(key, entry);
  }
}

/** Releases the session cache when its last window closes or opens another package. */
export function releasePackage(userId: string, hash: string): void {
  const key = `${userId}:${hash}`;
  const entry = packages.get(key);
  if (!entry) return;
  entry.references = Math.max(0, entry.references - 1);
  releaseIfUnused(key, entry);
}
