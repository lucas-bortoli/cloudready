// @vitest-environment happy-dom
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import FairyPopover from "./FairyPopover";
import type { FairyState } from "./FairyContext";

vi.mock("./FairyContext", () => ({ useFairy: () => fairy }));

let fairy: {
  state: () => FairyState;
  submit: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

it("tracks new messages while scrolled away and clears the notice on return", async () => {
  const root = document.createElement("div");
  const { artifact } = await captureArtifact(
    async () => {
      let update!: (value: FairyState) => FairyState;
      const initial: FairyState = {
        revision: 0,
        phase: "awaiting-input",
        messages: [],
        queued: null,
        activity: null,
        connected: true,
      };
      const dispose = render(() => {
        const [state, setState] = createSignal(initial);
        update = setState;
        fairy = { state, submit: vi.fn(), retry: vi.fn() };
        return <FairyPopover onClose={() => {}} onConnect={() => {}} />;
      }, root);
      flush();
      const list = root.querySelector<HTMLDivElement>(".overflow-y-auto")!;
      Object.defineProperties(list, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } });
      list.scrollTop = 0;
      list.dispatchEvent(new Event("scroll"));
      flush();
      update({ ...initial, revision: 1 });
      flush();
      expect(root.textContent).toContain("New message");
      list.scrollTop = 400;
      list.dispatchEvent(new Event("scroll"));
      flush();
      expect(root.textContent).not.toContain("New message");
      update({ ...initial, revision: 2 });
      flush();
      await Promise.resolve();
      flush();
      expect(list.scrollTop).toBe(500);
      expect(root.querySelector('[x-role="fairy conversation"]')).not.toBeNull();
      dispose();
    },
    { scenario: "fairy-conversation-scroll" },
  );
  expectNoDiagnostics(artifact);
});
