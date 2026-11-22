// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import Clock from "./Clock";

it("updates on minute boundaries and clears its timer on disposal", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:30Z"));
  try {
    const { artifact } = await captureArtifact(
      () => {
        const container = document.createElement("div");
        const dispose = render(() => <Clock />, container);
        flush();
        expect(container.querySelector("time")?.dateTime).toBe("2026-01-01T12:00:30.000Z");
        vi.advanceTimersByTime(30_000);
        flush();
        expect(container.querySelector("time")?.dateTime).toBe("2026-01-01T12:01:00.000Z");
        expect(vi.getTimerCount()).toBe(1);
        dispose();
        expect(vi.getTimerCount()).toBe(0);
      },
      { scenario: "clock-lifecycle" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    vi.useRealTimers();
  }
});
