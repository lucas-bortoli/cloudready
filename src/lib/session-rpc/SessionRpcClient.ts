export type SessionRpcMessage =
  | { type: "request"; id: string; method: string; params: unknown }
  | { type: "result"; id: string; result: unknown }
  | { type: "error"; id: string; error: { code: string; message: string } }
  | { type: "event"; method: string; params: unknown };

export class SessionRpcError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "SessionRpcError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type RequestHandler = (params: unknown) => Promise<unknown> | unknown;
type EventHandler = (params: unknown) => void;

/** Owns one reconnecting, authenticated browser-session RPC connection. */
export class SessionRpcClient {
  private socket: WebSocket | undefined;
  private nextId = 0;
  private reconnectTimer: number | undefined;
  private stopped = false;
  private readonly pending = new Map<
    string,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly requests = new Map<string, RequestHandler>();
  private readonly events = new Map<string, Set<EventHandler>>();

  public start(): void {
    this.stopped = false;
    this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close();
    this.socket = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(new SessionRpcError("session-rpc-disconnected", "Session RPC disconnected."));
    }
    this.pending.clear();
  }

  public call<T>(method: string, params: unknown): Promise<T> {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new SessionRpcError("session-rpc-disconnected", "Session RPC is offline."),
      );
    }
    const id = `${++this.nextId}`;
    this.send({ type: "request", id, method, params });
    return new Promise<T>((resolve, reject) =>
      this.pending.set(id, { resolve: (result) => resolve(result as T), reject }),
    );
  }

  public handle(method: string, handler: RequestHandler): () => void {
    this.requests.set(method, handler);
    return () => this.requests.delete(method);
  }

  public on(method: string, handler: EventHandler): () => void {
    const handlers = this.events.get(method) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.events.set(method, handlers);
    return () => handlers.delete(handler);
  }

  private connect(): void {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN) return;
    const url = new URL("/api/session/rpc", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, "cloudready-session-rpc.v1");
    this.socket = socket;
    socket.addEventListener("message", (event) => void this.receive(event));
    socket.addEventListener("close", () => this.scheduleReconnect());
    socket.addEventListener("error", () => socket.close());
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, 1000);
  }

  private async receive(event: MessageEvent): Promise<void> {
    if (typeof event.data !== "string") return;
    let message: SessionRpcMessage;
    try {
      message = JSON.parse(event.data) as SessionRpcMessage;
    } catch {
      return;
    }
    if (message.type === "event") {
      this.events.get(message.method)?.forEach((handler) => handler(message.params));
      return;
    }
    if (message.type === "result" || message.type === "error") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.type === "result") pending.resolve(message.result);
      else pending.reject(new SessionRpcError(message.error.code, message.error.message));
      return;
    }
    if (message.type !== "request") return;
    const handler = this.requests.get(message.method);
    if (!handler) {
      this.send({
        type: "error",
        id: message.id,
        error: { code: "session-rpc-method-not-found", message: "Unknown method." },
      });
      return;
    }
    try {
      this.send({ type: "result", id: message.id, result: await handler(message.params) });
    } catch {
      this.send({
        type: "error",
        id: message.id,
        error: { code: "session-rpc-handler-failed", message: "Request failed." },
      });
    }
  }

  private send(message: SessionRpcMessage): void {
    this.socket?.send(JSON.stringify(message));
  }
}
