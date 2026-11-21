import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { expect, it, vi } from "vitest";
import ReviewControls from "./ReviewControls";

it("keeps actions visible and prevents ending while a card awaits a rating", () => {
  const [revealed, setRevealed] = createSignal(false);
  const onEnd = vi.fn();
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(
    () => (
      <ReviewControls
        hasCard
        revealed={revealed()}
        saving={false}
        saveError={false}
        canUndo={false}
        intervalLabel={() => "1m"}
        onEnd={onEnd}
        onReveal={() => {}}
        onRate={() => {}}
        onUndo={() => {}}
      />
    ),
    root,
  );
  try {
    const buttons = [...root.querySelectorAll("button")];
    const end = buttons.find((button) => button.textContent?.includes("End review"))!;
    const show = buttons.find((button) => button.textContent?.includes("Show answer"))!;
    const good = buttons.find((button) => button.textContent?.includes("Good"))!;
    expect(end.hasAttribute("aria-disabled")).toBe(false);
    expect(good.getAttribute("aria-disabled")).toBe("true");
    setRevealed(true);
    expect(end.getAttribute("aria-disabled")).toBe("true");
    expect(show.getAttribute("aria-disabled")).toBe("true");
    expect(good.hasAttribute("aria-disabled")).toBe(false);
    end.click();
    expect(onEnd).not.toHaveBeenCalled();
  } finally {
    dispose();
    root.remove();
  }
});
