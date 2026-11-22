import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import WindowSwitchPreview from "./WindowSwitchPreview";
import type { WindowId } from "./WindowManager";

vi.mock("../layer-manager/LayerContext", () => ({
  useLayerItem: () => ({ zIndex: () => 10 }),
}));

it("tracks the selected window and viewport changes and removes its resize listener", async () => {
  const { artifact } = await captureArtifact(
    () => {
      const container = document.createElement("div");
      const target = document.createElement("div");
      target.dataset.windowId = "first";
      Object.defineProperty(target, "offsetParent", { value: document.body });
      let left = 20;
      target.getBoundingClientRect = () => ({ top: 10, right: 120, bottom: 110, left }) as DOMRect;
      document.body.append(target, container);
      const [selected, setSelected] = createSignal<WindowId>();
      const dispose = render(() => <WindowSwitchPreview selectedWindowId={selected} />, container);
      flush();
      expect(document.querySelector('[x-role="window switch preview"]')).toBeNull();
      setSelected("first" as WindowId);
      flush();
      const preview = document.querySelector<HTMLElement>('[x-role="window switch preview"]')!;
      expect(preview.style.left).toBe("20px");
      left = 40;
      window.dispatchEvent(new Event("resize"));
      flush();
      expect(preview.style.left).toBe("40px");
      setSelected(undefined);
      flush();
      expect(document.querySelector('[x-role="window switch preview"]')).toBeNull();
      const removeListener = vi.spyOn(window, "removeEventListener");
      dispose();
      expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
      removeListener.mockRestore();
      target.remove();
      container.remove();
    },
    { scenario: "window-switch-preview" },
  );
  expectNoDiagnostics(artifact);
});
