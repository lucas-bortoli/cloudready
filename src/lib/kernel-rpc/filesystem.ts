import * as v from "valibot";
import { route, makeCall } from "./core";
import type { Input } from "./core";

const uuid = v.pipe(v.string(), v.uuid());
const timestamp = v.number();
const nonNegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0));
const fileEntry = v.object({
  kind: v.literal("file"),
  id: uuid,
  path: v.string(),
  name: v.string(),
  size: nonNegativeInteger,
  mime_type: v.string(),
  created_at: timestamp,
  updated_at: timestamp,
});
const directoryEntry = v.object({
  kind: v.literal("directory"),
  id: uuid,
  path: v.string(),
  name: v.string(),
  created_at: timestamp,
  updated_at: timestamp,
});
const entry = v.variant("kind", [fileEntry, directoryEntry]);
const version = v.object({
  id: uuid,
  size: nonNegativeInteger,
  mime_type: v.string(),
  created_at: timestamp,
});
const deletedEntry = v.object({
  deletion_id: uuid,
  entry,
  deleted_at: timestamp,
});
const emptyInput = v.object({});
const emptyOutput = v.object({});
const okOutput = v.object({ ok: v.boolean() });
const pathInput = v.object({ path: v.string() });
const transferInput = v.object({ source: v.string(), destination: v.string() });
const revisionInput = v.object({ path: v.string(), revision_id: uuid });
const deletionInput = v.object({ deletion_id: uuid });
const truncateInput = v.object({ path: v.string(), size: nonNegativeInteger });

const routes = {
  filesystemList: route("GET", "/api/fs/list", pathInput, v.array(entry), (input) => ({
    query: input,
  })),
  filesystemStat: route("GET", "/api/fs/stat", pathInput, entry, (input) => ({ query: input })),
  filesystemReadFile: route(
    "GET",
    "/api/fs/file",
    v.object({
      path: v.string(),
      offset: v.optional(nonNegativeInteger),
      length: v.optional(nonNegativeInteger),
    }),
    emptyOutput,
    (input) => ({
      query: Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)])),
    }),
    true,
  ),
  filesystemWriteFile: route(
    "PUT",
    "/api/fs/file",
    v.object({
      path: v.string(),
      offset: v.optional(nonNegativeInteger),
      content: v.union([
        v.instance(ArrayBuffer),
        v.instance(Blob),
        v.custom<ArrayBufferView>((value) => ArrayBuffer.isView(value)),
      ]),
    }),
    fileEntry,
    ({ content, ...query }) => ({
      query: Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])),
      body: content,
    }),
  ),
  filesystemCreateFile: route("POST", "/api/fs/files", pathInput, fileEntry, (body) => ({ body })),
  filesystemCreateDirectory: route(
    "POST",
    "/api/fs/directories",
    pathInput,
    directoryEntry,
    (body) => ({ body }),
  ),
  filesystemMove: route("POST", "/api/fs/move", transferInput, entry, (body) => ({ body })),
  filesystemCopy: route("POST", "/api/fs/copy", transferInput, fileEntry, (body) => ({ body })),
  filesystemTruncate: route("POST", "/api/fs/truncate", truncateInput, fileEntry, (body) => ({
    body,
  })),
  filesystemDelete: route(
    "DELETE",
    "/api/fs/entries",
    v.object({ path: v.string(), recursive: v.optional(v.boolean()) }),
    v.object({ deletionId: uuid }),
    ({ path, recursive }) => ({
      query: { path, ...(recursive === undefined ? {} : { recursive: String(recursive) }) },
    }),
  ),
  filesystemListVersions: route(
    "GET",
    "/api/fs/versions",
    pathInput,
    v.array(version),
    (input) => ({ query: input }),
  ),
  filesystemRestoreVersion: route(
    "POST",
    "/api/fs/versions/restore",
    revisionInput,
    fileEntry,
    (body) => ({ body }),
  ),
  filesystemListDeleted: route("GET", "/api/fs/deleted", emptyInput, v.array(deletedEntry)),
  filesystemRestoreDeleted: route(
    "POST",
    "/api/fs/deleted/restore",
    deletionInput,
    okOutput,
    (body) => ({ body }),
  ),
  filesystemSearch: route(
    "GET",
    "/api/fs/search",
    v.object({ query: v.string(), mime: v.optional(v.string()) }),
    v.array(entry),
    (input) => ({ query: input }),
  ),
} as const;

/**
 * Lists the immediate children of a directory in the current profile's filesystem.
 *
 * @param input.path Absolute virtual path of the directory.
 * @returns The directory's file and directory entries.
 * @throws {KernelRpcInputError} When the path input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemList = (input: Input<typeof routes.filesystemList.input>) =>
  makeCall(routes.filesystemList, input);

/**
 * Gets metadata for a file or directory in the current profile's filesystem.
 *
 * @param input.path Absolute virtual path of the entry.
 * @returns The entry's identity, kind, path, and timestamps; files also include size and MIME type.
 * @throws {KernelRpcInputError} When the path input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemStat = (input: Input<typeof routes.filesystemStat.input>) =>
  makeCall(routes.filesystemStat, input);

/**
 * Reads all or part of a file from the current profile's filesystem.
 *
 * @param input.path Absolute virtual path of the file.
 * @param input.offset Byte position to start reading from; defaults to the start of the file.
 * @param input.length Maximum number of bytes to read; omitted to read through the end.
 * @returns The requested bytes as an ArrayBuffer.
 * @throws {KernelRpcInputError} When the path or byte range is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemReadFile = (input: Input<typeof routes.filesystemReadFile.input>) =>
  makeCall(routes.filesystemReadFile, input);

/**
 * Writes bytes to a file, replacing its contents or writing at a byte offset.
 *
 * @param input.path Absolute virtual path of the file.
 * @param input.content Bytes to write.
 * @param input.offset Byte position to begin writing; omitted to replace the file contents.
 * @returns Updated metadata for the file.
 * @throws {KernelRpcInputError} When the path, content, or offset is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemWriteFile = (input: Input<typeof routes.filesystemWriteFile.input>) =>
  makeCall(routes.filesystemWriteFile, input);

/**
 * Creates an empty file in the current profile's filesystem.
 *
 * @param input.path Absolute virtual path for the new file.
 * @returns Metadata for the created file.
 * @throws {KernelRpcInputError} When the path input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemCreateFile = (input: Input<typeof routes.filesystemCreateFile.input>) =>
  makeCall(routes.filesystemCreateFile, input);

/**
 * Creates a directory in the current profile's filesystem.
 *
 * @param input.path Absolute virtual path for the new directory.
 * @returns Metadata for the created directory.
 * @throws {KernelRpcInputError} When the path input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemCreateDirectory = (
  input: Input<typeof routes.filesystemCreateDirectory.input>,
) => makeCall(routes.filesystemCreateDirectory, input);

/**
 * Moves or renames a file or directory while preserving its history.
 *
 * @param input.source Current absolute virtual path of the entry.
 * @param input.destination New absolute virtual path for the entry.
 * @returns Metadata for the moved entry.
 * @throws {KernelRpcInputError} When either path is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemMove = (input: Input<typeof routes.filesystemMove.input>) =>
  makeCall(routes.filesystemMove, input);

/**
 * Copies a file's current contents to a new file with independent version history.
 *
 * @param input.source Absolute virtual path of the file to copy.
 * @param input.destination Absolute virtual path for the new file.
 * @returns Metadata for the copied file.
 * @throws {KernelRpcInputError} When either path is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemCopy = (input: Input<typeof routes.filesystemCopy.input>) =>
  makeCall(routes.filesystemCopy, input);

/**
 * Sets a file's size, discarding bytes beyond the new size or zero-filling when extended.
 *
 * @param input.path Absolute virtual path of the file.
 * @param input.size New size in bytes.
 * @returns Updated metadata for the file.
 * @throws {KernelRpcInputError} When the path or size is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemTruncate = (input: Input<typeof routes.filesystemTruncate.input>) =>
  makeCall(routes.filesystemTruncate, input);

/**
 * Moves an entry into recoverable deleted items.
 *
 * @param input.path Absolute virtual path of the entry.
 * @param input.recursive Whether to include a non-empty directory's descendants.
 * @returns The deletion ID, which can be used to restore the deleted entry tree.
 * @throws {KernelRpcInputError} When the path or recursive flag is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemDelete = (input: Input<typeof routes.filesystemDelete.input>) =>
  makeCall(routes.filesystemDelete, input);

/**
 * Lists a file's saved versions, newest first.
 *
 * @param input.path Absolute virtual path of the file.
 * @returns Version IDs, sizes, MIME types, and creation times.
 * @throws {KernelRpcInputError} When the path input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemListVersions = (input: Input<typeof routes.filesystemListVersions.input>) =>
  makeCall(routes.filesystemListVersions, input);

/**
 * Makes a saved version the current contents of a file.
 *
 * @param input.path Absolute virtual path of the file.
 * @param input.revision_id UUID of the version to restore.
 * @returns Updated metadata for the file.
 * @throws {KernelRpcInputError} When the path or revision ID is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemRestoreVersion = (
  input: Input<typeof routes.filesystemRestoreVersion.input>,
) => makeCall(routes.filesystemRestoreVersion, input);

/**
 * Lists recoverable deleted entry trees for the current profile.
 *
 * @returns Deleted roots, including their deletion IDs and deletion times.
 * @throws {KernelRpcInputError} When the input does not match the operation schema.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemListDeleted = (
  input: Input<typeof routes.filesystemListDeleted.input> = {},
) => makeCall(routes.filesystemListDeleted, input);

/**
 * Restores all entries in a deleted tree to their original paths.
 *
 * @param input.deletion_id UUID identifying the deletion to restore.
 * @returns Whether restoration succeeded.
 * @throws {KernelRpcInputError} When the deletion ID is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemRestoreDeleted = (
  input: Input<typeof routes.filesystemRestoreDeleted.input>,
) => makeCall(routes.filesystemRestoreDeleted, input);

/**
 * Searches live entry names in the current profile's filesystem.
 *
 * @param input.query Search expression for matching entry names.
 * @param input.mime Restrict matches to this MIME type when provided.
 * @returns Matching file and directory entries.
 * @throws {KernelRpcInputError} When the search input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const filesystemSearch = (input: Input<typeof routes.filesystemSearch.input>) =>
  makeCall(routes.filesystemSearch, input);
