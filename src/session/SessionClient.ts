import type { Uuid } from "../lib/uuid";
import {
  KernelRpcApiError,
  KernelRpcInputError,
  KernelRpcNetworkError,
  KernelRpcProtocolError,
  sessionCreateFirstUser,
  sessionEnd,
  sessionGetCurrent,
  sessionListUsers,
  sessionStart,
} from "../lib/kernel-rpc";
import {
  InvalidProfileDisplayNameError,
  ProfileNotFoundError,
  SessionExpiredError,
  SessionMissingError,
  SessionNetworkError,
  SessionProtocolError,
  SessionServerError,
  SessionSetupCompleteError,
} from "./errors";

export type UserProfile = Readonly<{
  id: Uuid<"UserId">;
  displayName: string;
  createdAt: Date;
}>;

type WireUser = {
  id: string;
  display_name: string;
  created_at: number;
};

/** Adapts validated kernel session operations to the profile types used by the interface. */
export class SessionClient {
  /**
   * Gets the profile associated with the browser's current session.
   * @throws {SessionMissingError} When no browser session is active.
   * @throws {SessionExpiredError} When the browser session has expired.
   * @throws {SessionNetworkError} When the kernel cannot be reached.
   * @throws {SessionProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async current(): Promise<UserProfile> {
    return this.adapt(async () => toProfile(await sessionGetCurrent({})));
  }

  /**
   * Lists profiles available for signing in on this installation.
   * @throws {SessionNetworkError} When the kernel cannot be reached.
   * @throws {SessionProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns a failure.
   */
  public async profiles(): Promise<readonly UserProfile[]> {
    return this.adapt(async () => (await sessionListUsers({})).map(toProfile));
  }

  /**
   * Creates the installation's first profile and starts a browser session.
   * @throws {InvalidProfileDisplayNameError} When the display name is invalid.
   * @throws {SessionSetupCompleteError} When initial setup has already completed.
   * @throws {SessionNetworkError} When the kernel cannot be reached.
   * @throws {SessionProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async createFirstProfile(displayName: string): Promise<UserProfile> {
    return this.adapt(async () =>
      toProfile(await sessionCreateFirstUser({ display_name: displayName })),
    );
  }

  /**
   * Starts a browser session for an existing profile.
   * @throws {ProfileNotFoundError} When the profile does not exist.
   * @throws {SessionNetworkError} When the kernel cannot be reached.
   * @throws {SessionProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async start(userId: UserProfile["id"]): Promise<UserProfile> {
    return this.adapt(async () => toProfile(await sessionStart({ user_id: userId })));
  }

  /**
   * Ends the current browser session.
   * @throws {SessionNetworkError} When the kernel cannot be reached.
   * @throws {SessionServerError} When the kernel returns a failure.
   */
  public async end(): Promise<void> {
    await this.adapt(async () => {
      await sessionEnd({});
    });
  }

  private async adapt<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof KernelRpcNetworkError)
        throw new SessionNetworkError("Could not reach the session kernel.", { cause: error });
      if (error instanceof KernelRpcProtocolError || error instanceof KernelRpcInputError)
        throw new SessionProtocolError("Session kernel returned an invalid response.", {
          cause: error,
        });
      if (error instanceof KernelRpcApiError) {
        switch (error.code) {
          case "session-missing":
            throw new SessionMissingError(error.message, { cause: error });
          case "session-expired":
            throw new SessionExpiredError(error.message, { cause: error });
          case "profile-not-found":
            throw new ProfileNotFoundError(error.message, { cause: error });
          case "setup-complete":
            throw new SessionSetupCompleteError(error.message, { cause: error });
          case "invalid-display-name":
            throw new InvalidProfileDisplayNameError(error.message, { cause: error });
          default:
            throw new SessionServerError(error.message, { cause: error });
        }
      }
      throw error;
    }
  }
}

export const sessions = new SessionClient();

function toProfile(value: WireUser): UserProfile {
  return {
    id: value.id as UserProfile["id"],
    displayName: value.display_name,
    createdAt: new Date(value.created_at),
  };
}
