// Central transport and wire validation for kernel API calls.
import * as v from "valibot";

export type Schema = v.GenericSchema;
export type Input<S extends Schema> = v.InferInput<S>;
export type Output<S extends Schema> = v.InferOutput<S>;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RequestParts = { query?: Record<string, string>; body?: BodyInit | object | null };

export type Route<I extends Schema, O extends Schema, B extends boolean = false> = {
  method: HttpMethod;
  path: string;
  input: I;
  output: O;
  request: (input: Input<I>) => RequestParts;
  binaryResponse: B;
};

export function route<I extends Schema, O extends Schema, B extends boolean = false>(
  method: HttpMethod,
  path: string,
  input: I,
  output: O,
  request: (input: Input<I>) => RequestParts = () => ({}),
  binaryResponse: B = false as B,
): Route<I, O, B> {
  return { method, path, input, output, request, binaryResponse };
}

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

export async function makeCall<I extends Schema, O extends Schema, B extends boolean>(
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
    throw new KernelRpcApiError(message, response.status, code);
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
