import type { SubjectContent, SubjectManifest, SubjectProgress } from "../learning-program";

/**
 * Resource bounds for in-memory JSON and archive metadata, not media size.
 */
export interface SubjectLimits {
  /**
   * Maximum decompressed manifest size in bytes.
   */
  manifestBytes: number;
  /**
   * Maximum decompressed content size in bytes.
   */
  contentBytes: number;
  /**
   * Maximum decompressed progress size in bytes.
   */
  progressBytes: number;
  /**
   * Archive entries including directory markers.
   */
  entries: number;
  /**
   * Number of nested topic levels, counting top-level topics as level one.
   */
  topicDepth: number;
}
/**
 * Options shared by package operations.
 */
export interface SubjectPackageOptions {
  signal?: AbortSignal;
  limits?: Partial<SubjectLimits>;
}
/**
 * Defaults can be overridden for trusted or larger documents.
 */
export const DEFAULT_SUBJECT_LIMITS: Readonly<SubjectLimits> = Object.freeze({
  manifestBytes: 1024 * 1024,
  contentBytes: 64 * 1024 * 1024,
  progressBytes: 64 * 1024 * 1024,
  entries: 100_000,
  topicDepth: 256,
});
/**
 * Assets supply a fresh stream each time; consumers do not own the package.
 */
export interface SubjectAsset {
  /**
   * Exact uncompressed byte count, a nonnegative safe integer.
   */
  size: number;
  /**
   * Opens a fresh asset stream. Extraction failures are delivered through the stream.
   * Consume or cancel the stream to release extraction resources.
   *
   * @param options An optional signal for this read only.
   * @returns A backpressure-aware stream of uncompressed bytes. Stream errors use
   * SubjectCancelledError, MalformedSubjectArchiveError, or SubjectStreamError.
   * @throws {SubjectCancelledError} If cancelled before opening.
   * @throws {SubjectPackageClosedError} If the archive has been closed.
   */
  openStream(options?: { signal?: AbortSignal }): ReadableStream<Uint8Array>;
}
/**
 * Editable documents and streaming assets used by readers and writers.
 */
export interface WritableSubject {
  manifest: SubjectManifest;
  content: SubjectContent;
  progress?: SubjectProgress;
  assets: ReadonlyMap<string, SubjectAsset>;
}
/**
 * A broken reference does not prevent editing or saving the subject.
 */
export interface SubjectReferenceWarning {
  sourceId: string;
  reference: string;
  reason: "missing-item" | "missing-asset";
}
/**
 * An open archive owns its lazy asset readers until close is called.
 */
export interface OpenSubjectPackage extends WritableSubject {
  warnings: SubjectReferenceWarning[];
  /**
   * Looks up a package-root asset path without starting extraction.
   *
   * @param path Exact canonical asset path, including assets/.
   * @returns A lazy descriptor owned by this package.
   * @throws {SubjectAssetNotFoundError} If the path is absent.
   * @throws {SubjectPackageClosedError} If the source package is closed.
   */
  getAsset(path: string): SubjectAsset;
  /**
   * Cancels active asset reads and prevents further reads; safe to call repeatedly.
   *
   * @returns A promise resolved when all active extraction tasks have settled.
   */
  close(): Promise<void>;
}
