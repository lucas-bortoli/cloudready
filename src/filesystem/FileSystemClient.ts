import type { Uuid } from "../lib/uuid";
import {
  FileSystemEntryConflictError,
  FileSystemEntryNotFoundError,
  FileSystemNetworkError,
  FileSystemProtocolError,
  FileSystemServerError,
  InvalidFileRangeError,
  InvalidFileSystemOperationError,
  InvalidFileSystemPathError,
} from "./errors";

export type FileId = Uuid<"FileId">;
export type DirectoryId = Uuid<"DirectoryId">;
export type RevisionId = Uuid<"RevisionId">;
export type DeletionId = Uuid<"DeletionId">;

export type FileEntry = Readonly<{
  id: FileId;
  path: string;
  name: string;
  kind: "file";
  size: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
}>;
export type DirectoryEntry = Readonly<{
  id: DirectoryId;
  path: string;
  name: string;
  kind: "directory";
  createdAt: Date;
  updatedAt: Date;
}>;
export type FileSystemEntry = FileEntry | DirectoryEntry;
export type FileVersion = Readonly<{
  id: RevisionId;
  size: number;
  mimeType: string;
  createdAt: Date;
}>;
export type DeletedEntry = Readonly<{
  deletionId: DeletionId;
  entry: FileSystemEntry;
  deletedAt: Date;
}>;
export type ReadFileOptions = Readonly<{ offset?: number; length?: number }>;
export type WriteFileOptions = Readonly<{ offset?: number }>;
export type SearchOptions = Readonly<{ mimeType?: string }>;

type WireEntry = {
  id: string;
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  mime_type?: string;
  created_at: number;
  updated_at: number;
};
type WireVersion = { id: string; size: number; mime_type: string; created_at: number };
type WireDeleted = { deletion_id: string; entry: WireEntry; deleted_at: number };

/** Browser client for the local kernel's virtual filesystem HTTP API. */
export class FileSystemClient {
  private readonly baseUrl: string;

  public constructor(baseUrl = "/api/fs") {
    this.baseUrl = baseUrl;
  }

  /**
   * Lists the live children of a directory.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When the directory is absent.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async list(path: string): Promise<readonly FileSystemEntry[]> {
    return this.json<WireEntry[]>("/list", { path }).then((value) => array(value, entry));
  }

  /**
   * Reads metadata for one live entry.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When it is absent.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async stat(path: string): Promise<FileSystemEntry> {
    return this.json<WireEntry>("/stat", { path }).then(entry);
  }

  /**
   * Reports whether a live entry exists at `path`.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch (error) {
      if (error instanceof FileSystemEntryNotFoundError) return false;
      throw error;
    }
  }

  /**
   * Creates an empty file.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When its parent is absent.
   * @throws {FileSystemEntryConflictError} When it already exists.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async createFile(path: string): Promise<FileEntry> {
    const value = await this.json<WireEntry>("/files", undefined, {
      method: "POST",
      json: { path },
    });
    const result = entry(value);
    if (result.kind !== "file")
      throw new FileSystemProtocolError("Kernel created a non-file entry.");
    return result;
  }

  /**
   * Creates a directory.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When its parent is absent.
   * @throws {FileSystemEntryConflictError} When it already exists.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async createDirectory(path: string): Promise<DirectoryEntry> {
    const value = await this.json<WireEntry>("/directories", undefined, {
      method: "POST",
      json: { path },
    });
    const result = entry(value);
    if (result.kind !== "directory")
      throw new FileSystemProtocolError("Kernel created a non-directory entry.");
    return result;
  }

  /**
   * Reads an optional byte range as a browser-native blob.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {InvalidFileRangeError} When the range is invalid.
   * @throws {FileSystemEntryNotFoundError} When the file is absent.
   * @throws {InvalidFileSystemOperationError} When `path` names a directory.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async readFile(path: string, options: ReadFileOptions = {}): Promise<Blob> {
    const response = await this.request("/file", { path, ...numbers(options) });
    return response.blob();
  }

  /**
   * Replaces file content or patches it at a byte offset.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {InvalidFileRangeError} When `offset` is invalid.
   * @throws {FileSystemEntryNotFoundError} When the file is absent.
   * @throws {InvalidFileSystemOperationError} When `path` names a directory.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async writeFile(
    path: string,
    content: Blob | Uint8Array,
    options: WriteFileOptions = {},
  ): Promise<FileEntry> {
    const body = content instanceof Blob ? content : new Blob([content.slice().buffer]);
    const value = await this.json<WireEntry>(
      "/file",
      { path, ...numbers(options) },
      { method: "PUT", body },
    );
    const result = entry(value);
    if (result.kind !== "file") throw new FileSystemProtocolError("Kernel wrote a non-file entry.");
    return result;
  }

  /**
   * Changes a file's size, extending with zero bytes where needed.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {InvalidFileRangeError} When `size` is invalid.
   * @throws {FileSystemEntryNotFoundError} When the file is absent.
   * @throws {InvalidFileSystemOperationError} When `path` names a directory.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async truncate(path: string, size: number): Promise<FileEntry> {
    const value = await this.json<WireEntry>("/truncate", undefined, {
      method: "POST",
      json: { path, size },
    });
    const result = entry(value);
    if (result.kind !== "file")
      throw new FileSystemProtocolError("Kernel truncated a non-file entry.");
    return result;
  }

  /**
   * Moves or renames an entry while preserving its history.
   * @throws {InvalidFileSystemPathError} When either path is malformed.
   * @throws {FileSystemEntryNotFoundError} When source or destination parent is absent.
   * @throws {FileSystemEntryConflictError} When destination exists.
   * @throws {InvalidFileSystemOperationError} When the move is invalid.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async move(source: string, destination: string): Promise<FileSystemEntry> {
    return this.json<WireEntry>("/move", undefined, {
      method: "POST",
      json: { source, destination },
    }).then(entry);
  }

  /**
   * Copies a file's current content into a new file with fresh history.
   * @throws {InvalidFileSystemPathError} When either path is malformed.
   * @throws {FileSystemEntryNotFoundError} When source or destination parent is absent.
   * @throws {FileSystemEntryConflictError} When destination exists.
   * @throws {InvalidFileSystemOperationError} When source is a directory.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async copy(source: string, destination: string): Promise<FileEntry> {
    const value = await this.json<WireEntry>("/copy", undefined, {
      method: "POST",
      json: { source, destination },
    });
    const result = entry(value);
    if (result.kind !== "file")
      throw new FileSystemProtocolError("Kernel copied a non-file entry.");
    return result;
  }

  /**
   * Hides an entry and returns its deletion record ID.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When it is absent.
   * @throws {InvalidFileSystemOperationError} When a non-empty directory is not recursive.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async remove(path: string, recursive = false): Promise<DeletionId> {
    const value = await this.json<{ deletionId: string }>(
      "/entries",
      { path, recursive: String(recursive) },
      { method: "DELETE" },
    );
    return uuid(value.deletionId, "deletion ID") as DeletionId;
  }

  /**
   * Lists immutable versions of a file, newest first.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When the file is absent.
   * @throws {InvalidFileSystemOperationError} When `path` names a directory.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async listVersions(path: string): Promise<readonly FileVersion[]> {
    return this.json<WireVersion[]>("/versions", { path }).then((value) => array(value, version));
  }

  /**
   * Makes one historical file version current.
   * @throws {InvalidFileSystemPathError} When `path` is malformed.
   * @throws {FileSystemEntryNotFoundError} When the file or revision is absent.
   * @throws {InvalidFileSystemOperationError} When `path` names a directory.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async restoreVersion(path: string, revisionId: RevisionId): Promise<FileEntry> {
    const value = await this.json<WireEntry>("/versions/restore", undefined, {
      method: "POST",
      json: { path, revision_id: revisionId },
    });
    const result = entry(value);
    if (result.kind !== "file")
      throw new FileSystemProtocolError("Kernel restored a non-file entry.");
    return result;
  }

  /**
   * Lists recoverable deletion roots.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async listDeleted(): Promise<readonly DeletedEntry[]> {
    return this.json<WireDeleted[]>("/deleted").then((value) => array(value, deleted));
  }

  /**
   * Restores every entry belonging to a deletion record.
   * @throws {FileSystemEntryNotFoundError} When the deletion record is absent.
   * @throws {FileSystemEntryConflictError} When restoring would overwrite a live entry.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async restore(deletionId: DeletionId): Promise<void> {
    await this.json<{ ok: boolean }>("/deleted/restore", undefined, {
      method: "POST",
      json: { deletion_id: deletionId },
    });
  }

  /**
   * Searches live names, optionally restricted to one MIME type.
   * @throws {InvalidFileSystemPathError} When the query is malformed.
   * @throws {FileSystemNetworkError} When the kernel is unreachable.
   * @throws {FileSystemProtocolError} When the response is invalid.
   * @throws {FileSystemServerError} When the kernel fails.
   */
  public async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<readonly FileSystemEntry[]> {
    return this.json<WireEntry[]>("/search", {
      query,
      ...(options.mimeType ? { mime: options.mimeType } : {}),
    }).then((value) => array(value, entry));
  }

  private async json<T>(
    path: string,
    query?: Record<string, string>,
    init?: { method: string; json?: unknown; body?: Blob },
  ): Promise<T> {
    const response = await this.request(path, query, init);
    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new FileSystemProtocolError("Kernel returned invalid JSON.", { cause });
    }
  }
  private async request(
    path: string,
    query?: Record<string, string | undefined>,
    init?: { method: string; json?: unknown; body?: Blob },
  ): Promise<Response> {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined) parameters.set(key, value);
    const url = `${this.baseUrl}${path}${parameters.size ? `?${parameters}` : ""}`;
    try {
      const response = await fetch(url, {
        method: init?.method,
        headers: init?.json === undefined ? undefined : { "Content-Type": "application/json" },
        body: init?.json === undefined ? init?.body : JSON.stringify(init.json),
      });
      if (!response.ok) {
        let code: string | undefined;
        let message = `Filesystem request failed with HTTP ${response.status}.`;
        try {
          const body = record(await response.json());
          const error = record(body.error);
          code = string(error.code, "error code");
          message = string(error.message, "error message");
        } catch {
          throw new FileSystemServerError(message, response.status);
        }
        switch (code) {
          case "invalid_path":
            throw new InvalidFileSystemPathError(message);
          case "invalid_range":
            throw new InvalidFileRangeError(message);
          case "entry_not_found":
            throw new FileSystemEntryNotFoundError(message);
          case "entry_conflict":
            throw new FileSystemEntryConflictError(message);
          case "invalid_operation":
            throw new InvalidFileSystemOperationError(message);
          default:
            throw new FileSystemServerError(message, response.status);
        }
      }
      return response;
    } catch (error) {
      if (
        error instanceof FileSystemNetworkError ||
        error instanceof FileSystemProtocolError ||
        error instanceof FileSystemServerError ||
        error instanceof InvalidFileSystemPathError ||
        error instanceof InvalidFileRangeError ||
        error instanceof FileSystemEntryNotFoundError ||
        error instanceof FileSystemEntryConflictError ||
        error instanceof InvalidFileSystemOperationError
      )
        throw error;
      throw new FileSystemNetworkError("Could not reach the filesystem kernel.", { cause: error });
    }
  }
}

/** The filesystem client for this single local kernel. */
export const filesystem = new FileSystemClient();

function numbers(values: ReadFileOptions | WriteFileOptions): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
}

function array<T, R>(value: T, map: (item: unknown) => R): readonly R[] {
  if (!Array.isArray(value))
    throw new FileSystemProtocolError("Kernel returned an array where an array was expected.");
  return value.map(map);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null)
    throw new FileSystemProtocolError("Kernel returned an invalid object.");
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string")
    throw new FileSystemProtocolError(`Kernel returned an invalid ${name}.`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new FileSystemProtocolError(`Kernel returned an invalid ${name}.`);
  return value;
}

function uuid(value: unknown, name: string): Uuid {
  const result = string(value, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))
    throw new FileSystemProtocolError(`Kernel returned an invalid ${name}.`);
  return result as Uuid;
}

function date(value: unknown, name: string): Date {
  const result = new Date(number(value, name));
  if (Number.isNaN(result.valueOf()))
    throw new FileSystemProtocolError(`Kernel returned an invalid ${name}.`);
  return result;
}

function entry(value: unknown): FileSystemEntry {
  const wire = record(value);
  const common = {
    id: uuid(wire.id, "entry ID"),
    path: string(wire.path, "path"),
    name: string(wire.name, "name"),
    createdAt: date(wire.created_at, "created_at"),
    updatedAt: date(wire.updated_at, "updated_at"),
  };
  if (wire.kind === "directory")
    return { ...common, id: common.id as DirectoryId, kind: "directory" };
  if (wire.kind === "file")
    return {
      ...common,
      id: common.id as FileId,
      kind: "file",
      size: number(wire.size, "size"),
      mimeType: string(wire.mime_type, "mime_type"),
    };
  throw new FileSystemProtocolError("Kernel returned an invalid entry kind.");
}

function version(value: unknown): FileVersion {
  const wire = record(value);
  return {
    id: uuid(wire.id, "revision ID") as RevisionId,
    size: number(wire.size, "size"),
    mimeType: string(wire.mime_type, "mime_type"),
    createdAt: date(wire.created_at, "created_at"),
  };
}

function deleted(value: unknown): DeletedEntry {
  const wire = record(value);
  return {
    deletionId: uuid(wire.deletion_id, "deletion ID") as DeletionId,
    entry: entry(wire.entry),
    deletedAt: date(wire.deleted_at, "deleted_at"),
  };
}
