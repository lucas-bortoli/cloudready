/** Base class for recoverable session API failures. */
abstract class SessionClientError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** No active session exists for this browser client. */
export class SessionMissingError extends SessionClientError {}

/** The saved browser session has expired. */
export class SessionExpiredError extends SessionClientError {}

/** The requested local profile does not exist. */
export class ProfileNotFoundError extends SessionClientError {}

/** The one-time initial profile setup has already completed. */
export class SessionSetupCompleteError extends SessionClientError {}

/** A profile display name is malformed. */
export class InvalidProfileDisplayNameError extends SessionClientError {}

/** The session service could not be reached. */
export class SessionNetworkError extends SessionClientError {}

/** The session service returned malformed JSON. */
export class SessionProtocolError extends SessionClientError {}

/** The session service returned an unexpected server failure. */
export class SessionServerError extends SessionClientError {}

/** Session context is unavailable outside its provider. */
export class SessionContextError extends SessionClientError {}
