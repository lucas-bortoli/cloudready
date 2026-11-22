// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush, Show } from "solid-js";
import { describe, expect, it } from "vitest";
import { LayerProvider, useLayerItem } from "./LayerContext";
import { layer } from "./layer";
import type { Layer } from "./LayerManager";

function TestLayers() {
  const [currentLayer, setCurrentLayer] = createSignal<Layer>("background");
  const [visible, setVisible] = createSignal(true);
  const other = useLayerItem("windowing");

  const move = () => setCurrentLayer("shell");
  const hide = () => setVisible(false);

  return (
    <>
      <Show when={visible()}>
        <div data-layer ref={layer(currentLayer)} />
      </Show>
      <span data-other>{other.zIndex()}</span>
      <button data-move onClick={move}>
        Move
      </button>
      <button data-hide onClick={hide}>
        Hide
      </button>
    </>
  );
}

describe("layer ref", () => {
  it("updates stacking when its layer changes and releases its item on disposal", async () => {
    const { artifact } = await captureArtifact(
      () => {
        const container = document.createElement("div");
        const dispose = render(
          () => (
            <LayerProvider>
              <TestLayers />
            </LayerProvider>
          ),
          container,
        );
        flush();
        const target = container.querySelector<HTMLElement>("[data-layer]")!;
        const other = container.querySelector<HTMLElement>("[data-other]")!;
        expect(target.style.zIndex).toBe("0");
        expect(other.textContent).toBe("1");
        container.querySelector<HTMLButtonElement>("[data-move]")!.click();
        flush();
        expect(target.style.zIndex).toBe("1");
        expect(other.textContent).toBe("0");
        container.querySelector<HTMLButtonElement>("[data-hide]")!.click();
        flush();
        expect(other.textContent).toBe("0");
        dispose();
      },
      { scenario: "layer-ref" },
    );
    expectNoDiagnostics(artifact);
  });
});
