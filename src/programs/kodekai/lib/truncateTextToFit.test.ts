// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { truncateTextToFit } from "./truncateTextToFit";

it("measures fitting text once and normalizes whitespace", () => {
  const element = document.createElement("p");
  const fits = vi.fn(() => true);

  expect(truncateTextToFit("one  two three", element, fits)).toBe("one two three");
  expect(fits).toHaveBeenCalledOnce();
});

it("finds the longest fitting whole-word prefix", () => {
  const element = document.createElement("p");
  const result = truncateTextToFit(
    "one two three four",
    element,
    () => (element.textContent ?? "").length <= 8,
  );

  expect(result).toBe("one two…");
});
