// @vitest-environment happy-dom

import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import DatePicker from "./DatePicker";

function renderDatePicker(input: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(input, container);
  const element = container.querySelector<HTMLInputElement>("input");

  if (!element) {
    throw new Error("DatePicker did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    element,
    wrapper: container.firstElementChild as HTMLDivElement,
  };
}

describe("DatePicker", () => {
  it("renders a controlled native date input and forwards safe native props", () => {
    const { dispose, element, wrapper } = renderDatePicker(() => (
      <DatePicker
        class="custom-class"
        name="due-date"
        onValueChange={() => undefined}
        required
        value="2026-09-27"
      />
    ));

    expect(element.type).toBe("date");
    expect(element.value).toBe("2026-09-27");
    expect(element.name).toBe("due-date");
    expect(element.required).toBe(true);
    expect(wrapper.className).toContain("h-7");
    expect(wrapper.className).toContain("border-neutral-400");
    expect(wrapper.className).toContain("custom-class");
    expect(element.className).toContain("appearance-none");
    expect(wrapper.querySelector("svg[aria-hidden='true']")?.getAttribute("class")).toContain(
      "z-10",
    );

    dispose();
  });

  it("synchronizes when its controlled value changes", () => {
    const [value, setValue] = createSignal("2026-09-27");
    const { dispose, element } = renderDatePicker(() => (
      <DatePicker onValueChange={setValue} value={value()} />
    ));

    setValue("2026-10-01");

    expect(element.value).toBe("2026-10-01");

    dispose();
  });

  it("reports an accepted browser-standard date value", () => {
    const onValueChange = vi.fn();
    const { dispose, element } = renderDatePicker(() => (
      <DatePicker onValueChange={onValueChange} value="2026-09-27" />
    ));

    element.value = "2026-10-01";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("2026-10-01");

    dispose();
  });

  it("opens the browser picker from an accepted click", () => {
    const onClick = vi.fn();
    const { dispose, element } = renderDatePicker(() => (
      <DatePicker onClick={onClick} onValueChange={() => undefined} value="2026-09-27" />
    ));
    const showPicker = vi.fn();
    Object.defineProperty(element, "showPicker", { value: showPicker });

    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(showPicker).toHaveBeenCalledOnce();

    dispose();
  });

  it("forwards x-role only when supplied", () => {
    const defaultPicker = renderDatePicker(() => (
      <DatePicker onValueChange={() => undefined} value="2026-09-27" />
    ));
    const namedPicker = renderDatePicker(() => (
      <DatePicker onValueChange={() => undefined} value="2026-09-27" x-role="due date field" />
    ));

    expect(defaultPicker.element.hasAttribute("x-role")).toBe(false);
    expect(namedPicker.element.getAttribute("x-role")).toBe("due date field");

    defaultPicker.dispose();
    namedPicker.dispose();
  });

  it("keeps inactive controls focusable while blocking edits and preserving bubbling", () => {
    const onParentInput = vi.fn();
    const onValueChange = vi.fn();
    const { dispose, element } = renderDatePicker(() => (
      <div onInput={onParentInput}>
        <DatePicker disabled onValueChange={onValueChange} value="2026-09-27" />
      </div>
    ));

    element.value = "2026-10-01";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));

    expect(element.getAttribute("aria-disabled")).toBe("true");
    expect(element.hasAttribute("disabled")).toBe(false);
    expect(element.tabIndex).toBe(0);
    expect(element.value).toBe("2026-09-27");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onParentInput).toHaveBeenCalledOnce();

    dispose();
  });

  it("forwards key events after preventing inactive keyboard edits", () => {
    const onKeyDown = vi.fn();
    const { dispose, element } = renderDatePicker(() => (
      <DatePicker
        disabled
        onKeyDown={onKeyDown}
        onValueChange={() => undefined}
        value="2026-09-27"
      />
    ));
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });

    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onKeyDown).toHaveBeenCalledOnce();

    dispose();
  });
});
