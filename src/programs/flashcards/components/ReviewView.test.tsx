import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import type { ReviewViewProps } from "./ReviewView";
import ReviewView from "./ReviewView";

function reviewProps(): ReviewViewProps {
  return {
    deckName: "Deck",
    summary: { due: 0, fresh: 1, nextDue: undefined },
    dailyLimit: 20,
    card: { id: "c", noteId: "n", deckId: "d", ordinal: 0, position: 1 },
    rendered: { front: "Question", back: "Answer", css: "", frontAudio: [], backAudio: [] },
    media: {},
    revealed: false,
    saving: false,
    saveError: false,
    canUndo: false,
    intervalLabel: () => "1m",
    onBack: vi.fn(),
    onLimit: vi.fn(),
    onReveal: vi.fn(),
    onReplay: vi.fn(),
    onRate: vi.fn(),
    onUndo: vi.fn(),
  };
}

describe("review view", () => {
  it("handles shortcuts inside review but ignores editable controls", () => {
    const props = reviewProps();
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => <ReviewView {...props} />, root);
    const view = root.firstElementChild!;
    view.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(props.onReveal).toHaveBeenCalledOnce();
    view.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    expect(props.onReplay).toHaveBeenCalledOnce();
    const input = root.querySelector("input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    expect(props.onReplay).toHaveBeenCalledOnce();
    input.value = "15";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(props.onLimit).toHaveBeenCalledWith(15);
    dispose();
    root.remove();
  });

  it("routes rating shortcuts only after the answer is shown", () => {
    const props = reviewProps();
    props.revealed = true;
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => <ReviewView {...props} />, root);
    root.firstElementChild!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "3", bubbles: true }),
    );
    expect(props.onRate).toHaveBeenCalledWith(3);
    expect(root.textContent).toContain("Good · 1m");
    dispose();
    root.remove();
  });
});
