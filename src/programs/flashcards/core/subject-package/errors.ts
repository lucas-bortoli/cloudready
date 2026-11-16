/**
 * Base for recoverable LAP package failures.
 */
export abstract class SubjectPackageError extends Error {
  /**
   * Creates a recoverable package error while preserving an underlying cause.
   *
   * @param message A description suitable for reporting to callers.
   * @param options Optional underlying cause.
   */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
/**
 * The archive is corrupt, ambiguous, or contains unsafe paths.
 */
export class MalformedSubjectArchiveError extends SubjectPackageError {}
/**
 * The format version, compression, encryption, or archive layout is unsupported.
 */
export class UnsupportedSubjectFormatError extends SubjectPackageError {}
/**
 * Subject documents violate the v1 model.
 */
export class InvalidSubjectDataError extends SubjectPackageError {}
/**
 * A configurable processing limit was exceeded.
 */
export class SubjectResourceLimitError extends SubjectPackageError {}
/**
 * A requested asset does not exist.
 */
export class SubjectAssetNotFoundError extends SubjectPackageError {}
/**
 * The caller cancelled an operation.
 */
export class SubjectCancelledError extends SubjectPackageError {}
/**
 * The source package has already been closed.
 */
export class SubjectPackageClosedError extends SubjectPackageError {}
/**
 * A source or destination stream failed.
 */
export class SubjectStreamError extends SubjectPackageError {}
