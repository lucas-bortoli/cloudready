// Central transport and wire validation for kernel API calls.
import * as v from "valibot";

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
const user = v.object({ id: uuid, display_name: v.string(), created_at: timestamp });
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
const displayNameInput = v.object({ display_name: v.string() });
const startSessionInput = v.object({ user_id: uuid });

type Schema = v.GenericSchema;
type Input<S extends Schema> = v.InferInput<S>;
type Output<S extends Schema> = v.InferOutput<S>;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RequestParts = { query?: Record<string, string>; body?: BodyInit | object | null };

type Route<I extends Schema, O extends Schema, B extends boolean = false> = {
  method: HttpMethod;
  path: string;
  input: I;
  output: O;
  request: (input: Input<I>) => RequestParts;
  binaryResponse: B;
};

function route<I extends Schema, O extends Schema, B extends boolean = false>(
  method: HttpMethod,
  path: string,
  input: I,
  output: O,
  request: (input: Input<I>) => RequestParts = () => ({}),
  binaryResponse: B = false as B,
): Route<I, O, B> {
  return { method, path, input, output, request, binaryResponse };
}

const routes = {
  systemGetHealth: route("GET", "/api/health", emptyInput, v.object({ status: v.literal("ok") })),
  systemGetHello: route("GET", "/api/hello", emptyInput, v.object({ message: v.string() })),
  sessionGetCurrent: route("GET", "/api/session", emptyInput, user),
  sessionStart: route("POST", "/api/session", startSessionInput, user, (body) => ({ body })),
  sessionEnd: route("DELETE", "/api/session", emptyInput, okOutput),
  sessionListUsers: route("GET", "/api/users", emptyInput, v.array(user)),
  sessionCreateFirstUser: route("POST", "/api/users", displayNameInput, user, (body) => ({ body })),
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
 * A GET operation was given a request body.
 */
export class RequestGetWithBodyError extends Error {
  public constructor() {
    super("GET requests cannot have a body.");
    this.name = "RequestGetWithBodyError";
  }
}

/**
 * Base class for catchable kernel RPC failures.
 */
export class KernelRpcError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * The kernel could not be reached.
 */
export class KernelRpcNetworkError extends KernelRpcError {
  public constructor(options?: ErrorOptions) {
    super("Could not reach the kernel.", options);
    this.name = "KernelRpcNetworkError";
  }
}

/**
 * The caller supplied input that does not match the operation's schema.
 */
export class KernelRpcInputError extends KernelRpcError {
  public constructor(options?: ErrorOptions) {
    super("Kernel request input failed schema validation.", options);
    this.name = "KernelRpcInputError";
  }
}

/**
 * The kernel returned a response that does not match its declared schema.
 */
export class KernelRpcProtocolError extends KernelRpcError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KernelRpcProtocolError";
  }
}

/**
 * Base class for HTTP failures reported by the kernel.
 */
export class KernelRpcApiError extends KernelRpcError {
  public readonly status: number;
  public readonly code: string;

  public constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * A filesystem path or request parameter is invalid.
 */
export class KernelRpcInvalidPathError extends KernelRpcApiError {}
/**
 * A file byte range is invalid.
 */
export class KernelRpcInvalidRangeError extends KernelRpcApiError {}
/**
 * A requested filesystem entry, revision, or deletion does not exist.
 */
export class KernelRpcEntryNotFoundError extends KernelRpcApiError {}
/**
 * A filesystem operation would overwrite an existing entry.
 */
export class KernelRpcEntryConflictError extends KernelRpcApiError {}
/**
 * A filesystem operation is invalid for the target entry.
 */
export class KernelRpcInvalidOperationError extends KernelRpcApiError {}
/**
 * The current browser session is missing.
 */
export class KernelRpcSessionMissingError extends KernelRpcApiError {}
/**
 * The current browser session has expired.
 */
export class KernelRpcSessionExpiredError extends KernelRpcApiError {}
/**
 * The requested profile does not exist.
 */
export class KernelRpcProfileNotFoundError extends KernelRpcApiError {}
/**
 * Initial profile setup has already completed.
 */
export class KernelRpcSetupCompleteError extends KernelRpcApiError {}
/**
 * The supplied profile display name is invalid.
 */
export class KernelRpcInvalidDisplayNameError extends KernelRpcApiError {}
/**
 * The kernel reported an unclassified HTTP or server failure.
 */
export class KernelRpcServerError extends KernelRpcApiError {}

/**
 * Creates a typed error from a kernel HTTP error code.
 *
 * @param message Human-readable message returned by the kernel.
 * @param status HTTP response status.
 * @param code Stable machine-readable error code returned by the kernel.
 */
export function createKernelRpcApiError(
  message: string,
  status: number,
  code: string,
): KernelRpcApiError {
  switch (code) {
    case "invalid-path":
      return new KernelRpcInvalidPathError(message, status, code);
    case "invalid-range":
      return new KernelRpcInvalidRangeError(message, status, code);
    case "entry-not-found":
      return new KernelRpcEntryNotFoundError(message, status, code);
    case "entry-conflict":
      return new KernelRpcEntryConflictError(message, status, code);
    case "invalid-operation":
      return new KernelRpcInvalidOperationError(message, status, code);
    case "session-missing":
      return new KernelRpcSessionMissingError(message, status, code);
    case "session-expired":
      return new KernelRpcSessionExpiredError(message, status, code);
    case "profile-not-found":
      return new KernelRpcProfileNotFoundError(message, status, code);
    case "setup-complete":
      return new KernelRpcSetupCompleteError(message, status, code);
    case "invalid-display-name":
      return new KernelRpcInvalidDisplayNameError(message, status, code);
    default:
      return new KernelRpcServerError(message, status, code);
  }
}

async function makeCall<I extends Schema, O extends Schema, B extends boolean>(
  operation: Route<I, O, B>,
  input: Input<I>,
): Promise<B extends true ? ArrayBuffer : Output<O>> {
  let validatedInput: Input<I>;
  try {
    validatedInput = v.parse(operation.input, input);
  } catch (cause) {
    throw new KernelRpcInputError({ cause });
  }
  const { query = {}, body } = operation.request(validatedInput);
  if (operation.method === "GET" && body !== undefined) throw new RequestGetWithBodyError();

  const url = new URL(operation.path, window.location.origin);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const headers = new Headers();
  let encodedBody: BodyInit | null | undefined;
  if (body == null) {
    encodedBody = body;
  } else if (typeof body === "string") {
    headers.set("content-type", "text/plain;charset=UTF-8");
    encodedBody = body;
  } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    headers.set("content-type", "application/octet-stream");
    if (body instanceof ArrayBuffer) {
      encodedBody = body;
    } else {
      const bytes = new Uint8Array(body.byteLength);
      bytes.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
      encodedBody = bytes;
    }
  } else if (body instanceof Blob) {
    if (body.type) headers.set("content-type", body.type);
    encodedBody = body;
  } else if (body instanceof URLSearchParams) {
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    encodedBody = body;
  } else if (body instanceof FormData) {
    encodedBody = body;
  } else {
    headers.set("content-type", "application/json");
    encodedBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: operation.method,
      headers,
      body: encodedBody,
      credentials: "same-origin",
    });
  } catch (cause) {
    throw new KernelRpcNetworkError({ cause });
  }

  if (!response.ok) {
    let code = "server-error";
    let message = `Kernel request failed with HTTP ${response.status}.`;
    try {
      const errorBody: unknown = await response.json();
      const parsed = v.safeParse(
        v.object({ error: v.object({ code: v.string(), message: v.string() }) }),
        errorBody,
      );
      if (parsed.success) ({ code, message } = parsed.output.error);
    } catch {
      // Keep the status-based fallback for non-JSON error responses.
    }
    throw createKernelRpcApiError(message, response.status, code);
  }

  if (operation.binaryResponse) {
    try {
      return (await response.arrayBuffer()) as B extends true ? ArrayBuffer : Output<O>;
    } catch (cause) {
      throw new KernelRpcProtocolError("Kernel returned an unreadable binary response.", { cause });
    }
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch (cause) {
    throw new KernelRpcProtocolError("Kernel returned invalid JSON.", { cause });
  }
  try {
    return v.parse(operation.output, responseBody) as B extends true ? ArrayBuffer : Output<O>;
  } catch (cause) {
    throw new KernelRpcProtocolError("Kernel response failed schema validation.", { cause });
  }
}

/**
 * Checks whether the kernel is responding.
 *
 * @returns The kernel's health status.
 * @throws {KernelRpcInputError} When the input does not match the operation schema.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const systemGetHealth = (input: Input<typeof routes.systemGetHealth.input> = {}) =>
  makeCall(routes.systemGetHealth, input);

/**
 * Returns a simple greeting from the kernel, useful for checking basic API connectivity.
 *
 * @returns The kernel's greeting message.
 * @throws {KernelRpcInputError} When the input does not match the operation schema.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const systemGetHello = (input: Input<typeof routes.systemGetHello.input> = {}) =>
  makeCall(routes.systemGetHello, input);

/**
 * Gets the profile associated with the browser's current session.
 *
 * @returns The active profile's ID, display name, and creation time.
 * @throws {KernelRpcInputError} When the input does not match the operation schema.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionGetCurrent = (input: Input<typeof routes.sessionGetCurrent.input> = {}) =>
  makeCall(routes.sessionGetCurrent, input);

/**
 * Starts a browser session for an existing profile.
 *
 * @param input.user_id ID of the profile to sign in as.
 * @returns The signed-in profile. The kernel sets the session cookie.
 * @throws {KernelRpcInputError} When the profile ID is not a UUID or input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionStart = (input: Input<typeof routes.sessionStart.input>) =>
  makeCall(routes.sessionStart, input);

/**
 * Ends the current browser session and clears its session cookie.
 *
 * @returns Whether the session was ended.
 * @throws {KernelRpcInputError} When the input does not match the operation schema.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionEnd = (input: Input<typeof routes.sessionEnd.input> = {}) =>
  makeCall(routes.sessionEnd, input);

/**
 * Lists profiles available for signing in on this installation.
 *
 * @returns Profiles ordered by their creation time.
 * @throws {KernelRpcInputError} When the input does not match the operation schema.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionListUsers = (input: Input<typeof routes.sessionListUsers.input> = {}) =>
  makeCall(routes.sessionListUsers, input);

/**
 * Creates the installation's first profile and starts a session for it.
 * This operation is available only before initial profile setup is complete.
 *
 * @param input.display_name Name to show for the new profile.
 * @returns The created profile. The kernel sets the session cookie.
 * @throws {KernelRpcInputError} When the display name input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionCreateFirstUser = (input: Input<typeof routes.sessionCreateFirstUser.input>) =>
  makeCall(routes.sessionCreateFirstUser, input);

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
