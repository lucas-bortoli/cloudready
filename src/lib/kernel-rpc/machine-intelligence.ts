import * as v from "valibot";
import { route, makeCall } from "./core";

const emptyInput = v.object({});
const miConnection = v.object({ connected: v.boolean(), email: v.nullable(v.string()) });
const miAuthorization = v.object({ attempt_id: v.string(), url: v.string() });
const miAuthorizationStatus = v.object({
  status: v.picklist(["pending", "succeeded", "failed"]),
  error: v.nullable(v.string()),
});
const miModel = v.object({ slug: v.string(), display_name: v.string() });

const routes = {
  miGetConnection: route("GET", "/api/mi/connection", emptyInput, miConnection),
  miStartAuthorization: route("POST", "/api/mi/authorization", emptyInput, miAuthorization),
  miGetAuthorization: route(
    "GET",
    "/api/mi/authorization",
    v.object({ attempt_id: v.string() }),
    miAuthorizationStatus,
    (input) => ({ query: input }),
  ),
  miDisconnect: route(
    "DELETE",
    "/api/mi/connection",
    emptyInput,
    v.object({ revoked: v.boolean() }),
  ),
  miListModels: route("GET", "/api/mi/models", emptyInput, v.array(miModel)),
  miGenerateText: route(
    "POST",
    "/api/mi/responses",
    v.object({ model: v.string(), input: v.string() }),
    v.object({ text: v.string() }),
    (body) => ({ body }),
  ),
} as const;

/**
 * Gets the current profile's ChatGPT connection without exposing credentials.
 * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
 * @throws {KernelRpcProtocolError} When the response is malformed.
 * @throws {KernelRpcApiError} When the kernel rejects the request.
 */
export const miGetConnection = () => makeCall(routes.miGetConnection, {});
/**
 * Starts a ChatGPT authorization attempt and returns its URL.
 * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
 * @throws {KernelRpcProtocolError} When the response is malformed.
 * @throws {KernelRpcApiError} When the kernel rejects the request.
 */
export const miStartAuthorization = () => makeCall(routes.miStartAuthorization, {});
/**
 * Checks the result of an authorization attempt.
 * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
 * @throws {KernelRpcProtocolError} When the response is malformed.
 * @throws {KernelRpcApiError} When the kernel rejects the request.
 */
export const miGetAuthorization = (attempt_id: string) =>
  makeCall(routes.miGetAuthorization, { attempt_id });
/**
 * Revokes and removes the current profile's ChatGPT connection.
 * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
 * @throws {KernelRpcProtocolError} When the response is malformed.
 * @throws {KernelRpcApiError} When the kernel rejects the request.
 */
export const miDisconnect = () => makeCall(routes.miDisconnect, {});
/**
 * Lists models available to the connected ChatGPT account.
 * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
 * @throws {KernelRpcProtocolError} When the response is malformed.
 * @throws {KernelRpcApiError} When the kernel rejects the request.
 */
export const miListModels = () => makeCall(routes.miListModels, {});
/**
 * Runs a text prompt with the selected model.
 * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
 * @throws {KernelRpcProtocolError} When the response is malformed.
 * @throws {KernelRpcApiError} When the kernel rejects the request.
 */
export const miGenerateText = (model: string, input: string) =>
  makeCall(routes.miGenerateText, { model, input });
