/** Base implementation detail shared by catchable filesystem errors. */
abstract class FileSystemClientError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The supplied logical path or request parameters are malformed. */
export class InvalidFileSystemPathError extends FileSystemClientError {}

/** A byte offset or length does not describe a valid file range. */
export class InvalidFileRangeError extends FileSystemClientError {}

/** A requested live entry, revision, or deletion record does not exist. */
export class FileSystemEntryNotFoundError extends FileSystemClientError {}

/** An operation would overwrite an existing live filesystem entry. */
export class FileSystemEntryConflictError extends FileSystemClientError {}

/** An operation is not valid for the target entry or its current state. */
export class InvalidFileSystemOperationError extends FileSystemClientError {}

/** The browser could not connect to the local kernel. */
export class FileSystemNetworkError extends FileSystemClientError {}

/** The kernel returned a successful response that violates the filesystem protocol. */
export class FileSystemProtocolError extends FileSystemClientError {}

/** The kernel returned an unclassified or server-side HTTP failure. */
export class FileSystemServerError extends FileSystemClientError {
  public readonly status: number;

  public constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}
