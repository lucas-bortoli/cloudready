import {
  BlobReader,
  ZipReader,
  ZipWriter,
  ERR_SPLIT_ZIP_FILE,
  ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  ERR_ENCRYPTED,
  ERR_UNSUPPORTED_COMPRESSION,
  ERR_UNSUPPORTED_ENCRYPTION,
  type FileEntry,
} from "@zip.js/zip.js";
import * as errors from "./errors";
import type { SubjectContent, SubjectManifest, SubjectProgress } from "../learning-program";
import type {
  OpenSubjectPackage,
  SubjectAsset,
  SubjectPackageOptions,
  SubjectReferenceWarning,
  WritableSubject,
} from "./types";
import { subjectLimits, validateSubject, validateSubjectPath } from "./validation";

class SubjectBlobReader extends BlobReader {
  public override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    try {
      return await super.readUint8Array(index, length);
    } catch (cause) {
      throw new errors.SubjectStreamError("Could not read source Blob.", { cause });
    }
  }
}

function failure(
  cause: unknown,
  signal?: AbortSignal,
  archive = false,
): errors.SubjectPackageError {
  if (signal?.aborted)
    return new errors.SubjectCancelledError("Subject operation cancelled.", { cause });
  if (cause instanceof errors.SubjectPackageError) return cause;
  if (
    cause instanceof Error &&
    [
      ERR_SPLIT_ZIP_FILE,
      ERR_ENCRYPTED_CENTRAL_DIRECTORY,
      ERR_ENCRYPTED,
      ERR_UNSUPPORTED_COMPRESSION,
      ERR_UNSUPPORTED_ENCRYPTION,
    ].includes(cause.message)
  )
    return new errors.UnsupportedSubjectFormatError("Unsupported archive feature.", { cause });
  return archive
    ? new errors.MalformedSubjectArchiveError("Could not decode subject archive.", { cause })
    : new errors.SubjectStreamError("Subject stream failed.", { cause });
}
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new errors.SubjectCancelledError("Subject operation cancelled.", {
      cause: signal.reason,
    });
}

/**
 * Opens and validates a LAP archive without extracting its media into memory.
 * Asset integrity is checked on demand. Keep the returned handle open while
 * consuming or copying its asset streams; close it to release active readers.
 *
 * @param blob A seekable ZIP or ZIP64 source, typically a browser File.
 * @param options Cancellation and configurable metadata/JSON limits.
 * @returns Validated documents, lazy assets, reference warnings, and a close handle.
 * @throws {MalformedSubjectArchiveError} If the ZIP is corrupt, ambiguous, or unsafe.
 * @throws {UnsupportedSubjectFormatError} If version, encryption, or compression is unsupported.
 * @throws {InvalidSubjectDataError} If documents violate the v1 model.
 * @throws {SubjectResourceLimitError} If metadata, JSON, or nesting exceeds a limit.
 * @throws {SubjectCancelledError} If opening is cancelled.
 * @throws {SubjectStreamError} If reading the source Blob fails.
 */
export async function openSubjectPackage(
  blob: Blob,
  options: SubjectPackageOptions = {},
): Promise<OpenSubjectPackage> {
  const limits = subjectLimits(options);
  cancelled(options.signal);
  const lifetime = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, lifetime.signal])
    : lifetime.signal;
  const reader = new ZipReader(new SubjectBlobReader(blob), {
    useWebWorkers: false,
    checkSignature: true,
    strictness: "strict",
  });
  let closed = false;
  const active = new Set<Promise<unknown>>();
  const entries = new Map<string, FileEntry>();
  const paths = new Set<string>();
  const assets = new Map<string, SubjectAsset>();
  const stream = (
    entry: FileEntry,
    caller?: AbortSignal,
    maxBytes?: number,
  ): ReadableStream<Uint8Array> => {
    if (closed) throw new errors.SubjectPackageClosedError("Subject package is closed.");
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal, ...(caller ? [caller] : [])]);
    cancelled(combined);
    const bridge = new TransformStream<Uint8Array, Uint8Array>();
    const pump = entry
      .getData(bridge.writable, { signal: combined, checkSignature: true, useWebWorkers: false })
      .catch((cause: unknown) => {
        throw failure(cause, combined, true);
      });
    active.add(pump);
    // Install a rejection handler even if the caller never pulls the stream.
    void pump.then(
      () => active.delete(pump),
      () => active.delete(pump),
    );
    const input = bridge.readable.getReader();
    let extracted = 0;
    // zip.js can be waiting on backpressure when cancellation arrives. Cancel
    // the readable explicitly so its pending destination write is released.
    const release = () => {
      void input.cancel(combined.reason).catch(() => {});
    };
    combined.addEventListener("abort", release, { once: true });
    void pump.then(
      () => combined.removeEventListener("abort", release),
      () => combined.removeEventListener("abort", release),
    );
    if (combined.aborted) release();
    return new ReadableStream<Uint8Array>(
      {
        async pull(output) {
          try {
            const chunk = await input.read();
            if (chunk.done) {
              await pump;
              if (extracted !== entry.uncompressedSize)
                throw new errors.MalformedSubjectArchiveError(
                  "Asset size does not match archive metadata.",
                );
              output.close();
            } else {
              extracted += chunk.value.byteLength;
              if (maxBytes !== undefined && extracted > maxBytes)
                throw new errors.SubjectResourceLimitError(
                  "JSON exceeds its decompressed byte limit.",
                );
              if (extracted > entry.uncompressedSize) {
                throw new errors.MalformedSubjectArchiveError("Entry exceeds declared size.");
              }
              output.enqueue(chunk.value);
            }
          } catch (cause) {
            const error = failure(cause, combined, true);
            output.error(error);
            controller.abort(error);
            await input.cancel(error).catch(() => {});
          }
        },
        async cancel(reason) {
          controller.abort(reason);
          await input.cancel(reason).catch(() => {});
          await pump.catch(() => {});
        },
      },
      { highWaterMark: 0 },
    );
  };
  try {
    let count = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      cancelled(signal);
      if (++count > limits.entries)
        throw new errors.SubjectResourceLimitError("Too many archive entries.");
      try {
        validateSubjectPath(entry.filename, entry.directory);
      } catch (cause) {
        throw new errors.MalformedSubjectArchiveError("Unsafe or unsupported archive path.", {
          cause,
        });
      }
      const key = entry.directory ? entry.filename.slice(0, -1) : entry.filename;
      if (paths.has(key))
        throw new errors.MalformedSubjectArchiveError(`Duplicate archive path: ${key}`);
      paths.add(key);
      if (
        entry.diskNumberStart !== 0 ||
        entry.encrypted ||
        ![0, 8].includes(entry.compressionMethod)
      )
        throw new errors.UnsupportedSubjectFormatError(
          "Multipart, encrypted, or unsupported compressed entry.",
        );
      if (
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize < 0 ||
        !Number.isSafeInteger(entry.compressedSize) ||
        entry.compressedSize < 0
      )
        throw new errors.SubjectResourceLimitError("ZIP size exceeds safe integer range.");
      if (entry.directory) continue;
      entries.set(key, entry);
      if (key.startsWith("assets/"))
        assets.set(key, {
          size: entry.uncompressedSize,
          openStream: (o) => stream(entry, o?.signal),
        });
    }
    for (const path of paths) {
      const parts = path.split("/");
      while (parts.length > 1) {
        parts.pop();
        if (entries.has(parts.join("/")))
          throw new errors.MalformedSubjectArchiveError("A file cannot contain another entry.");
      }
    }
    const json = async (name: string, limit: number): Promise<unknown> => {
      const entry = entries.get(name);
      if (!entry) throw new errors.InvalidSubjectDataError(`Missing ${name}.`);
      if (entry.uncompressedSize > limit)
        throw new errors.SubjectResourceLimitError(`${name} exceeds its byte limit.`);
      const input = stream(entry, undefined, limit).getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const next = await input.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > limit)
            throw new errors.SubjectResourceLimitError(
              `${name} exceeds its decompressed byte limit.`,
            );
          chunks.push(next.value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        try {
          return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch (cause) {
          throw new errors.InvalidSubjectDataError(`Invalid UTF-8 JSON in ${name}.`, { cause });
        }
      } finally {
        await input.cancel().catch(() => {});
      }
    };
    const manifest = (await json("manifest.json", limits.manifestBytes)) as SubjectManifest;
    const content = (await json("content.json", limits.contentBytes)) as SubjectContent;
    const progress = entries.has("progress.json")
      ? ((await json("progress.json", limits.progressBytes)) as SubjectProgress)
      : undefined;
    const subject = { manifest, content, progress, assets };
    const warnings = validateSubject(subject, options);
    return {
      ...subject,
      warnings,
      getAsset(path: string) {
        if (closed) throw new errors.SubjectPackageClosedError("Subject package is closed.");
        const asset = assets.get(path);
        if (!asset) throw new errors.SubjectAssetNotFoundError(`Missing asset: ${path}`);
        return asset;
      },
      async close() {
        if (closed) return;
        closed = true;
        lifetime.abort();
        await Promise.allSettled([...active]);
        await reader.close();
      },
    };
  } catch (cause) {
    lifetime.abort();
    await Promise.allSettled([...active]);
    await reader.close().catch(() => {});
    throw failure(cause, options.signal, true);
  }
}

/**
 * Validates and streams a fresh subject archive into a caller-owned destination.
 * Assets are read sequentially with backpressure. Successful writing closes the
 * destination; any failure aborts it. Partial output must not replace a saved file.
 *
 * @param subject Editable documents and fresh-stream asset suppliers.
 * @param writable Destination for ZIP64 bytes; it must not already be locked.
 * @param options Cancellation and document/metadata limits.
 * @returns Warnings for missing assets or internal links.
 * @throws {InvalidSubjectDataError} If documents, paths, or asset sizes are invalid.
 * @throws {UnsupportedSubjectFormatError} If the manifest is unsupported.
 * @throws {SubjectResourceLimitError} If a configured limit is exceeded.
 * @throws {SubjectCancelledError} If writing is cancelled.
 * @throws {SubjectPackageClosedError} If an asset source was closed.
 * @throws {MalformedSubjectArchiveError} If an archive-backed source is corrupt.
 * @throws {SubjectStreamError} If a source or destination stream fails.
 */
export async function writeSubjectPackage(
  subject: WritableSubject,
  writable: WritableStream<Uint8Array>,
  options: SubjectPackageOptions = {},
): Promise<SubjectReferenceWarning[]> {
  return write(subject, writable, options);
}

/**
 * Writes a new archive containing content and assets, omitting learner progress.
 * Content and provenance are preserved; this does not redact authored personal data.
 *
 * @param subject Source documents and lazy assets; the source must remain open.
 * @param writable Unlocked destination, closed on success and aborted on failure.
 * @param options Cancellation and processing limits.
 * @returns Reference warnings for the exported content.
 * @throws {InvalidSubjectDataError} If source data or asset metadata is invalid.
 * @throws {UnsupportedSubjectFormatError} If the manifest is unsupported.
 * @throws {SubjectResourceLimitError} If a processing limit is exceeded.
 * @throws {SubjectCancelledError} If cancelled.
 * @throws {SubjectPackageClosedError} If an asset source was closed.
 * @throws {MalformedSubjectArchiveError} If a source archive asset is corrupt.
 * @throws {SubjectStreamError} If stream I/O fails.
 */
export async function exportSubjectWithoutProgress(
  subject: WritableSubject,
  writable: WritableStream<Uint8Array>,
  options: SubjectPackageOptions = {},
): Promise<SubjectReferenceWarning[]> {
  return write({ ...subject, progress: undefined }, writable, options);
}

async function write(
  subject: WritableSubject,
  writable: WritableStream<Uint8Array>,
  options: SubjectPackageOptions,
): Promise<SubjectReferenceWarning[]> {
  let destination: WritableStreamDefaultWriter<Uint8Array> | undefined;
  let current: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => {
    void current?.cancel(options.signal?.reason).catch(() => {});
    void destination?.abort(options.signal?.reason).catch(() => {});
  };
  try {
    destination = writable.getWriter();
    cancelled(options.signal);
    const warnings = validateSubject(subject, options);
    const limits = subjectLimits(options);
    const json: Array<[string, Uint8Array]> = [];
    for (const [name, value, limit] of [
      ["manifest.json", subject.manifest, limits.manifestBytes],
      ["content.json", subject.content, limits.contentBytes],
      ["progress.json", subject.progress, limits.progressBytes],
    ] as const) {
      if (value === undefined) continue;
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      if (bytes.length > limit)
        throw new errors.SubjectResourceLimitError(`${name} exceeds its byte limit.`);
      json.push([name, bytes]);
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    const output = new WritableStream<Uint8Array>({
      write: (chunk) => destination!.write(chunk),
      close: () => destination!.close(),
      abort: (reason) => destination!.abort(reason),
    });
    const zip = new ZipWriter(output, { zip64: true, useWebWorkers: false });
    for (const [name, bytes] of json) {
      cancelled(options.signal);
      await zip.add(name, new BlobReader(new Blob([bytes.slice().buffer])), {
        level: 6,
        signal: options.signal,
      });
    }
    for (const [name, asset] of subject.assets) {
      cancelled(options.signal);
      current = asset.openStream({ signal: options.signal }).getReader();
      const input = current;
      let count = 0;
      const bounded = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            cancelled(options.signal);
            const next = await input.read();
            if (next.done) {
              if (count !== asset.size)
                throw new errors.InvalidSubjectDataError(`Asset size mismatch: ${name}`);
              controller.close();
            } else {
              count += next.value.byteLength;
              if (count > asset.size)
                throw new errors.InvalidSubjectDataError(`Asset exceeds declared size: ${name}`);
              controller.enqueue(next.value);
            }
          },
          cancel: (reason) => input.cancel(reason),
        },
        { highWaterMark: 0 },
      );
      // Stored media avoids wasting CPU recompressing already compressed attachments.
      await zip.add(name, bounded, { level: 0, signal: options.signal });
      await input.cancel();
      input.releaseLock();
      current = undefined;
    }
    cancelled(options.signal);
    await zip.close();
    return warnings;
  } catch (cause) {
    const error = failure(cause, options.signal);
    await current?.cancel(error).catch(() => {});
    if (destination) await destination.abort(error).catch(() => {});
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    current?.releaseLock();
    destination?.releaseLock();
  }
}
