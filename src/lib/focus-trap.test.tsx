import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import focusTrap from "./focus-trap";

it("wraps keyboard focus and removes its listener on disposal", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const { artifact } = await captureArtifact(
    () => {
      const dispose = render(
        () => (
          <div ref={focusTrap()}>
            <button>First</button>
            <button>Last</button>
          </div>
        ),
        root,
      );
      const container = root.firstElementChild as HTMLElement;
      const [first, last] = Array.from(container.querySelectorAll("button"));
      for (const button of [first, last]) {
        vi.spyOn(button, "getClientRects").mockReturnValue([
          {} as DOMRect,
        ] as unknown as DOMRectList);
      }
      last.focus();
      last.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(first);
      first.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(document.activeElement).toBe(last);
      const removeListener = vi.spyOn(container, "removeEventListener");
      dispose();
      expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    },
    { scenario: "focus-trap-ref" },
  );
  expectNoDiagnostics(artifact);
  root.remove();
});
