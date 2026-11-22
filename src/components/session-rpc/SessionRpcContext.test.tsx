// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { SessionRpcClient } from "../../lib/session-rpc/SessionRpcClient";
import { SessionRpcProvider, useSessionRpc } from "./SessionRpcContext";

it("starts the provided client and stops it when disposed", async () => {
  const start = vi.spyOn(SessionRpcClient.prototype, "start").mockImplementation(() => {});
  const stop = vi.spyOn(SessionRpcClient.prototype, "stop").mockImplementation(() => {});
  let client: SessionRpcClient | undefined;

  function Consumer() {
    client = useSessionRpc();
    return <div />;
  }

  try {
    const { artifact } = await captureArtifact(
      () => {
        const dispose = render(
          () => (
            <SessionRpcProvider>
              <Consumer />
            </SessionRpcProvider>
          ),
          document.createElement("div"),
        );
        flush();
        expect(start).toHaveBeenCalledOnce();
        expect(start.mock.instances[0]).toBe(client);
        dispose();
        expect(stop).toHaveBeenCalledOnce();
        expect(stop.mock.instances[0]).toBe(client);
      },
      { scenario: "session-rpc-lifecycle" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    start.mockRestore();
    stop.mockRestore();
  }
});
