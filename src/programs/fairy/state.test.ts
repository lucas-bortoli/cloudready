import { describe, expect, it } from "vitest";
import { applyFairyDelta } from "./state";
import type { FairyState } from "./FairyContext";

const initial: FairyState = {
  revision: 0,
  phase: "awaiting-input",
  messages: [],
  queued: null,
  activity: null,
  connected: true,
};

describe("shared Fairy revisions", () => {
  it("keeps two sessions identical through incremental output and a mid-stream snapshot", () => {
    const created = {
      revision: 1,
      changes: [
        {
          kind: "message-created",
          message: { id: "answer", role: "assistant", text: "", status: "pending" },
        },
        { kind: "phase-changed", phase: "generating-text", activity: "Responding" },
      ],
    };
    let first = applyFairyDelta(initial, created)!;
    first = applyFairyDelta(first, {
      revision: 2,
      changes: [{ kind: "text-appended", id: "answer", text: "Hello" }],
    })!;
    const snapshot = structuredClone(first);
    const chunk = {
      revision: 3,
      changes: [{ kind: "text-appended", id: "answer", text: " world" }],
    };
    expect(applyFairyDelta(first, chunk)).toEqual(applyFairyDelta(snapshot, chunk));
    expect(applyFairyDelta(first, chunk)?.messages[0]?.text).toBe("Hello world");
    expect(initial.messages).toEqual([]);
  });

  it("applies shared provider connection changes without a snapshot", () => {
    const connected = applyFairyDelta(initial, {
      revision: 1,
      changes: [{ kind: "connection-changed", connected: false }],
    })!;
    expect(connected.connected).toBe(false);
    expect(
      applyFairyDelta(connected, {
        revision: 2,
        changes: [{ kind: "connection-changed", connected: true }],
      })?.connected,
    ).toBe(true);
  });

  it("ignores covered revisions and requests a snapshot for gaps or unknown messages", () => {
    expect(applyFairyDelta(initial, { revision: 0, changes: [] })).toBe(initial);
    expect(applyFairyDelta(initial, { revision: 2, changes: [] })).toBeUndefined();
    expect(
      applyFairyDelta(initial, {
        revision: 1,
        changes: [{ kind: "text-appended", id: "missing", text: "x" }],
      }),
    ).toBeUndefined();
  });
});
