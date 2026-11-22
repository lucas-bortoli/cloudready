// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { FairyProvider, useFairy } from "./FairyContext";

const rpc = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  call: vi.fn(),
}));

vi.mock("../../components/session-rpc/SessionRpcContext", () => ({
  useSessionRpc: () => rpc,
}));
vi.mock("../../components/window-manager/WindowManagerContext", () => ({
  useWindowManager: () => ({ getWindows: () => [] }),
}));

it("subscribes to Fairy updates and releases its handlers on disposal", async () => {
  const removers = [vi.fn(), vi.fn(), vi.fn()];
  rpc.handle.mockReturnValue(removers[0]);
  rpc.on.mockReturnValueOnce(removers[1]).mockReturnValueOnce(removers[2]);
  rpc.call.mockResolvedValue(undefined);

  let revision = () => 0;
  function Consumer() {
    const fairy = useFairy();
    revision = () => fairy.state().revision;
    return <span />;
  }

  const { artifact } = await captureArtifact(
    () => {
      const container = document.createElement("div");
      const dispose = render(
        () => (
          <FairyProvider>
            <Consumer />
          </FairyProvider>
        ),
        container,
      );
      flush();
      expect(rpc.handle).toHaveBeenCalledWith("fairy.session.describe", expect.any(Function));
      expect(rpc.on).toHaveBeenCalledWith("fairy.state.snapshot", expect.any(Function));
      expect(rpc.on).toHaveBeenCalledWith("fairy.state.delta", expect.any(Function));
      expect(rpc.call).toHaveBeenCalledWith("fairy.subscribe", {});
      const snapshot = rpc.on.mock.calls.find(([name]) => name === "fairy.state.snapshot")?.[1];
      snapshot({ revision: 2, connected: true, messages: [] });
      flush();
      expect(revision()).toBe(2);
      dispose();
      for (const remove of removers) expect(remove).toHaveBeenCalledOnce();
    },
    { scenario: "fairy-provider-lifecycle" },
  );
  expectNoDiagnostics(artifact);
});
