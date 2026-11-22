import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import Flashcard from "./Flashcard";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Flashcard", () => {
  it("flips after a side change and cancels pending animations on disposal", async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const root = document.createElement("div");
    const { artifact } = await captureArtifact(
      () => {
        let setBack!: (value: boolean) => boolean;
        const dispose = render(() => {
          const [back, updateBack] = createSignal(false);
          setBack = updateBack;
          return (
            <Flashcard showBack={back()}>
              {(visibleBack) => <span>{String(visibleBack())}</span>}
            </Flashcard>
          );
        }, root);
        flush();
        expect(root.textContent).toBe("false");
        expect(vi.getTimerCount()).toBe(0);
        setBack(true);
        flush();
        expect(root.textContent).toBe("false");
        vi.advanceTimersByTime(150);
        flush();
        expect(root.textContent).toBe("true");
        setBack(false);
        flush();
        dispose();
        expect(vi.getTimerCount()).toBe(0);
        expect(disconnect).toHaveBeenCalledOnce();
      },
      { scenario: "flashcard-flip" },
    );
    expectNoDiagnostics(artifact);
  });
});
