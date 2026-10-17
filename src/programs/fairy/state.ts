import type { FairyMessage, FairyState } from "./FairyContext";

type Change =
  | { kind: "connection-changed"; connected: boolean }
  | { kind: "message-created" | "message-updated"; message: FairyMessage }
  | { kind: "text-appended"; id: string; text: string }
  | { kind: "phase-changed"; phase: FairyState["phase"]; activity: string | null };

/** Applies an ordered server revision; undefined requests an authoritative resynchronization. */
export function applyFairyDelta(state: FairyState, value: unknown): FairyState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const delta = value as { revision?: number; changes?: Change[] };
  if (typeof delta.revision !== "number" || !Array.isArray(delta.changes)) return undefined;
  if (delta.revision <= state.revision) return state;
  if (delta.revision !== state.revision + 1) return undefined;
  let next = state;
  for (const change of delta.changes) {
    switch (change.kind) {
      case "connection-changed":
        next = { ...next, connected: change.connected };
        break;
      case "message-created":
        next = { ...next, messages: [...next.messages, change.message] };
        break;
      case "message-updated":
        if (!next.messages.some((message) => message.id === change.message.id)) return undefined;
        next = {
          ...next,
          messages: next.messages.map((message) =>
            message.id === change.message.id ? change.message : message,
          ),
        };
        break;
      case "text-appended":
        if (!next.messages.some((message) => message.id === change.id)) return undefined;
        next = {
          ...next,
          messages: next.messages.map((message) =>
            message.id === change.id ? { ...message, text: message.text + change.text } : message,
          ),
        };
        break;
      case "phase-changed":
        next = { ...next, phase: change.phase, activity: change.activity };
        break;
      default:
        return undefined;
    }
  }
  return { ...next, revision: delta.revision };
}
