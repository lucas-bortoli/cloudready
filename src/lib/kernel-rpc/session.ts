import * as v from "valibot";
import { route, makeCall } from "./core";
import type { Input } from "./core";

const uuid = v.pipe(v.string(), v.uuid());
const timestamp = v.number();
const nonNegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0));
const profilePicture = v.object({ mime_type: v.string(), size: nonNegativeInteger });
const user = v.object({
  id: uuid,
  display_name: v.string(),
  created_at: timestamp,
  profile_picture: v.nullable(profilePicture),
});
const emptyInput = v.object({});
const emptyOutput = v.object({});
const okOutput = v.object({ ok: v.boolean() });
const displayNameInput = v.object({ display_name: v.string() });
const startSessionInput = v.object({ user_id: uuid });

const routes = {
  sessionGetCurrent: route("GET", "/api/session", emptyInput, user),
  sessionStart: route("POST", "/api/session", startSessionInput, user, (body) => ({ body })),
  sessionEnd: route("DELETE", "/api/session", emptyInput, okOutput),
  sessionListUsers: route("GET", "/api/users", emptyInput, v.array(user)),
  sessionCreateFirstUser: route("POST", "/api/users", displayNameInput, user, (body) => ({ body })),
  sessionGetProfilePicture: route(
    "GET",
    "/api/profile-picture",
    emptyInput,
    emptyOutput,
    undefined,
    true,
  ),
  sessionPutProfilePicture: route(
    "PUT",
    "/api/profile-picture",
    v.object({
      content: v.union([
        v.instance(ArrayBuffer),
        v.instance(Blob),
        v.custom<ArrayBufferView>((value) => ArrayBuffer.isView(value)),
      ]),
    }),
    profilePicture,
    ({ content }) => ({ body: content }),
  ),
} as const;

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
 * Downloads the active profile's picture bytes.
 *
 * @returns The profile picture as an ArrayBuffer.
 * @throws {KernelRpcInputError} When the input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionGetProfilePicture = (
  input: Input<typeof routes.sessionGetProfilePicture.input> = {},
) => makeCall(routes.sessionGetProfilePicture, input);

/**
 * Replaces the active profile's picture with a supported image.
 *
 * @param input.content Image bytes in JPEG, PNG, GIF, or WebP format, up to 5 MiB.
 * @returns The stored picture's MIME type and size.
 * @throws {KernelRpcInputError} When the input is malformed.
 * @throws {KernelRpcNetworkError}
 * @throws {KernelRpcProtocolError}
 * @throws {KernelRpcApiError}
 */
export const sessionPutProfilePicture = (
  input: Input<typeof routes.sessionPutProfilePicture.input>,
) => makeCall(routes.sessionPutProfilePicture, input);
