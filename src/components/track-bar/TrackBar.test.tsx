// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import TrackBar from "./TrackBar";

it("updates from keyboard and pointer input, and respects disabled state", async () => {
  const { artifact } = await captureArtifact(async () => {
    const [value, setValue] = createSignal(0.5);
    const [disabled, setDisabled] = createSignal(false);
    const onChange = vi.fn(setValue);
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(
      () => (
        <TrackBar
          ariaLabel="Volume"
          value={value()}
          onValueChange={onChange}
          range={{ min: 0, max: 1 }}
          step={0.01}
          disabled={disabled()}
        />
      ),
      container,
    );
    const slider = container.querySelector<HTMLDivElement>('[role="slider"]')!;
    expect(slider.getAttribute("aria-label")).toBe("Volume");
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    flush();
    expect(slider.getAttribute("aria-valuenow")).toBe("0.51");
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    flush();
    expect(slider.getAttribute("aria-valuenow")).toBe("1");
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true }));
    flush();
    expect(slider.getAttribute("aria-valuenow")).toBe("0.3");
    slider.getBoundingClientRect = () => ({ left: 10, width: 100 }) as DOMRect;
    slider.setPointerCapture = vi.fn();
    slider.hasPointerCapture = () => true;
    slider.releasePointerCapture = vi.fn();
    slider.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, clientX: 85, bubbles: true }),
    );
    flush();
    expect(slider.getAttribute("aria-valuenow")).toBe("0.75");
    slider.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
    expect(slider.releasePointerCapture).toHaveBeenCalledWith(1);
    setDisabled(true);
    flush();
    onChange.mockClear();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    slider.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 2, clientX: 10, bubbles: true }),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(slider.getAttribute("aria-disabled")).toBe("true");
    dispose();
    container.remove();
  });
  expectNoDiagnostics(artifact);
});
