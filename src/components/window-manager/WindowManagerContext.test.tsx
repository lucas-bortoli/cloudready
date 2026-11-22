import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import WindowManager from "./WindowManager";
import { WindowManagerProvider } from "./WindowManagerContext";

it("starts activation tracking after mounting and stops it on disposal", async () => {
  const stopTracking = vi.fn();
  const attach = vi
    .spyOn(WindowManager.prototype, "attachActivationTracking")
    .mockReturnValue(stopTracking);

  try {
    const { artifact } = await captureArtifact(
      () => {
        const container = document.createElement("div");
        const dispose = render(
          () => (
            <LayerProvider>
              <WindowManagerProvider>
                <div>Window content</div>
              </WindowManagerProvider>
            </LayerProvider>
          ),
          container,
        );
        flush();
        expect(attach).toHaveBeenCalledOnce();
        expect(attach).toHaveBeenCalledWith(document);
        dispose();
        expect(stopTracking).toHaveBeenCalledOnce();
      },
      { scenario: "window-manager-provider-lifecycle" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    attach.mockRestore();
  }
});
