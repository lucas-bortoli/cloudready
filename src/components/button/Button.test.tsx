// @vitest-environment jsdom

import type { JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vite-plus/test";
import Button from "./Button";

function renderButton(button: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(button, container);
  const element = container.querySelector("button");

  if (!element) {
    throw new Error("Button did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    element,
  };
}

describe("Button", () => {
  it("uses the compact secondary button defaults", () => {
    const { dispose, element } = renderButton(() => <Button>Save</Button>);

    expect(element.type).toBe("button");
    expect(element.className).toContain("bg-white");
    expect(element.className).toContain("h-7");

    dispose();
  });

  it("renders explicit variants, icons, and caller classes", () => {
    const { dispose, element } = renderButton(() => (
      <Button
        class="custom-class"
        endIcon={<span>→</span>}
        startIcon={<span>←</span>}
        variant="danger"
      >
        Delete
      </Button>
    ));

    expect(element.className).toContain("hover:bg-red-50");
    expect(element.className).toContain("h-7");
    expect(element.className).toContain("custom-class");
    expect(element.textContent).toBe("←Delete→");
    expect(element.querySelector('[aria-hidden="true"]')).not.toBeNull();

    dispose();
  });

  it("renders the primary and ghost variant surfaces", () => {
    const primaryButton = renderButton(() => <Button variant="primary">Save</Button>);
    const ghostButton = renderButton(() => <Button variant="ghost">Cancel</Button>);

    expect(primaryButton.element.className).toContain("bg-neutral-800");
    expect(ghostButton.element.className).toContain("bg-transparent");
    expect(ghostButton.element.className).toContain("h-7");

    primaryButton.dispose();
    ghostButton.dispose();
  });

  it("shows a busy indicator without changing its accessible disabled semantics", () => {
    const { dispose, element } = renderButton(() => <Button loading>Save</Button>);

    expect(element.getAttribute("aria-busy")).toBe("true");
    expect(element.getAttribute("aria-disabled")).toBe("true");
    expect(element.hasAttribute("disabled")).toBe(false);
    expect(element.querySelector("svg")).not.toBeNull();

    dispose();
  });

  it("forwards x-role only when supplied", () => {
    const defaultButton = renderButton(() => <Button>Save</Button>);
    const namedButton = renderButton(() => <Button x-role="save action">Save</Button>);

    expect(defaultButton.element.hasAttribute("x-role")).toBe(false);
    expect(namedButton.element.getAttribute("x-role")).toBe("save action");

    defaultButton.dispose();
    namedButton.dispose();
  });

  it("uses title as a textless button's tooltip and default accessible name", () => {
    const { dispose, element } = renderButton(() => (
      <Button startIcon={<span>×</span>} title="Close" />
    ));

    expect(element.getAttribute("title")).toBe("Close");
    expect(element.getAttribute("aria-label")).toBe("Close");

    dispose();
  });

  it("preserves an explicit textless button aria-label", () => {
    const { dispose, element } = renderButton(() => (
      <Button aria-label="Dismiss dialog" startIcon={<span>×</span>} title="Close" />
    ));

    expect(element.getAttribute("aria-label")).toBe("Dismiss dialog");

    dispose();
  });

  it("prevents inactive activation without stopping event bubbling", () => {
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    const { dispose, element } = renderButton(() => (
      <div onClick={onParentClick}>
        <Button disabled onClick={onClick}>
          Save
        </Button>
      </div>
    ));
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
    expect(onParentClick).toHaveBeenCalledOnce();
    expect(element.getAttribute("aria-disabled")).toBe("true");
    expect(element.hasAttribute("disabled")).toBe(false);

    dispose();
  });

  it("calls active click handlers and preserves explicit button types", () => {
    const onClick = vi.fn();
    const { dispose, element } = renderButton(() => (
      <Button onClick={onClick} type="submit">
        Save
      </Button>
    ));

    element.click();

    expect(onClick).toHaveBeenCalledOnce();
    expect(element.type).toBe("submit");

    dispose();
  });
});
