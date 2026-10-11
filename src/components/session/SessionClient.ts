import {
  KernelRpcApiError,
  sessionCreateFirstUser,
  sessionEnd,
  sessionGetCurrent,
  sessionListUsers,
  sessionGetProfilePicture,
  sessionPutProfilePicture,
  sessionStart,
} from "../../lib/kernel-rpc";
import type { Uuid } from "../../lib/uuid";
import {
  InvalidProfileDisplayNameError,
  InvalidProfilePictureError,
  ProfilePictureMissingError,
  ProfileNotFoundError,
  ProfilePictureTooLargeError,
  SessionExpiredError,
  SessionMissingError,
  SessionServerError,
  SessionSetupCompleteError,
} from "./errors";

export type UserProfile = Readonly<{
  id: Uuid<"UserId">;
  displayName: string;
  createdAt: Date;
  profilePicture: Readonly<{ mimeType: string; size: number }> | null;
}>;

type WireUser = {
  id: string;
  display_name: string;
  created_at: number;
  profile_picture: { mime_type: string; size: number } | null;
};

/** Adapts validated kernel session operations to the profile types used by the interface. */
export class SessionClient {
  /**
   * Gets the profile associated with the browser's current session.
   * @throws {SessionMissingError} When no browser session is active.
   * @throws {SessionExpiredError} When the browser session has expired.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async current(): Promise<UserProfile> {
    return this.adapt(async () => toProfile(await sessionGetCurrent({})));
  }

  /**
   * Lists profiles available for signing in on this installation.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns a failure.
   */
  public async profiles(): Promise<readonly UserProfile[]> {
    return this.adapt(async () => (await sessionListUsers({})).map(toProfile));
  }

  /**
   * Creates the installation's first profile and starts a browser session.
   * @throws {InvalidProfileDisplayNameError} When the display name is invalid.
   * @throws {SessionSetupCompleteError} When initial setup has already completed.
   * @throws {KernelRpcInputError} When the display name is malformed.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
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
   * @throws {KernelRpcInputError} When the profile ID is malformed.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async start(userId: UserProfile["id"]): Promise<UserProfile> {
    return this.adapt(async () => toProfile(await sessionStart({ user_id: userId })));
  }

  /**
   * Ends the current browser session.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {SessionServerError} When the kernel returns a failure.
   */
  public async end(): Promise<void> {
    await this.adapt(async () => {
      await sessionEnd({});
    });
  }

  /**
   * Downloads the active profile's uploaded picture.
   *
   * @returns The image bytes.
   * @throws {ProfilePictureMissingError} When the profile has no uploaded picture.
   * @throws {SessionMissingError} When no browser session is active.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async profilePicture(): Promise<ArrayBuffer> {
    return this.adapt(async () => sessionGetProfilePicture({}));
  }

  /**
   * Replaces the active profile's picture with a supported image.
   *
   * @param content Image bytes in JPEG, PNG, GIF, or WebP format, up to 5 MiB.
   * @returns Metadata for the stored image.
   * @throws {InvalidProfilePictureError} When the bytes are not a supported image.
   * @throws {ProfilePictureTooLargeError} When the image exceeds 5 MiB.
   * @throws {SessionMissingError} When no browser session is active.
   * @throws {KernelRpcInputError} When the image input is malformed.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
   * @throws {SessionServerError} When the kernel returns another failure.
   */
  public async setProfilePicture(
    content: Blob | ArrayBuffer | ArrayBufferView,
  ): Promise<NonNullable<UserProfile["profilePicture"]>> {
    return this.adapt(async () => {
      const picture = await sessionPutProfilePicture({ content });
      return { mimeType: picture.mime_type, size: picture.size };
    });
  }

  private async adapt<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
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
          case "invalid-profile-picture":
            throw new InvalidProfilePictureError(error.message, { cause: error });
          case "profile-picture-too-large":
            throw new ProfilePictureTooLargeError(error.message, { cause: error });
          case "profile-picture-missing":
            throw new ProfilePictureMissingError(error.message, { cause: error });
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
    profilePicture: value.profile_picture && {
      mimeType: value.profile_picture.mime_type,
      size: value.profile_picture.size,
    },
  };
}
