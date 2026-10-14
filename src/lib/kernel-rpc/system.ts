import * as v from "valibot";
import { route, makeCall } from "./core";
import type { Input } from "./core";

const emptyInput = v.object({});

const routes = {
  systemGetHealth: route("GET", "/api/health", emptyInput, v.object({ status: v.literal("ok") })),
  systemGetHello: route("GET", "/api/hello", emptyInput, v.object({ message: v.string() })),
} as const;

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
