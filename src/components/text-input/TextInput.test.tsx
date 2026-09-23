// @vitest-environment happy-dom

import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import TextInput from "./TextInput";

function renderTextInput(input: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(input, container);
  const element = container.querySelector("textarea");

  if (!element) {
    throw new Error("TextInput did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    element,
  };
}

describe("TextInput", () => {
  it("renders a controlled compact single-line textarea by default", () => {
    const onValueChange = vi.fn();
    const { dispose, element } = renderTextInput(() => (
      <TextInput class="custom-class" onValueChange={onValueChange} value="CloudReady" />
    ));

    expect(element.value).toBe("CloudReady");
    expect(element.getAttribute("rows")).toBe("1");
    expect(element.getAttribute("spellcheck")).toBe("false");
    expect(element.getAttribute("role")).toBe("textbox");
    expect(element.getAttribute("aria-multiline")).toBe("false");
    expect(element.className).toContain("h-7");
    expect(element.className).toContain("resize-none");
    expect(element.className).toContain("custom-class");

    dispose();
  });

  it("synchronizes the textarea when its controlled value changes", () => {
    const [value, setValue] = createSignal("Initial");
    const { dispose, element } = renderTextInput(() => (
      <TextInput onValueChange={setValue} value={value()} />
    ));

    setValue("Updated");

    expect(element.value).toBe("Updated");

    dispose();
  });

  it("normalizes typed and pasted line breaks before reporting a single-line value", () => {
    const onValueChange = vi.fn();
    const { dispose, element } = renderTextInput(() => (
      <TextInput onValueChange={onValueChange} value="Initial" />
    ));

    element.value = "one\ntwo\r\nthree\rfour";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));

    expect(element.value).toBe("onetwothreefour");
    expect(onValueChange).toHaveBeenCalledWith("onetwothreefour");

    dispose();
  });

  it("prevents Enter in single-line mode while forwarding the key event", () => {
    const onKeyDown = vi.fn();
    const { dispose, element } = renderTextInput(() => (
      <TextInput onKeyDown={onKeyDown} onValueChange={() => undefined} value="" />
    ));
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });

    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onKeyDown).toHaveBeenCalledOnce();

    dispose();
  });

  it("uses native multiline textarea semantics and preserves line breaks", () => {
    const onValueChange = vi.fn();
    const { dispose, element } = renderTextInput(() => (
      <TextInput multiLine onValueChange={onValueChange} rows={5} value="First\nSecond" />
    ));

    expect(element.getAttribute("rows")).toBe("5");
    expect(element.hasAttribute("role")).toBe(false);
    expect(element.hasAttribute("aria-multiline")).toBe(false);
    expect(element.className).toContain("resize-none");

    element.value = "Third\nFourth";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(onValueChange).toHaveBeenCalledWith("Third\nFourth");

    dispose();
  });

  it("forwards x-role only when supplied", () => {
    const defaultInput = renderTextInput(() => (
      <TextInput onValueChange={() => undefined} value="" />
    ));
    const namedInput = renderTextInput(() => (
      <TextInput onValueChange={() => undefined} value="" x-role="search field" />
    ));

    expect(defaultInput.element.hasAttribute("x-role")).toBe(false);
    expect(namedInput.element.getAttribute("x-role")).toBe("search field");

    defaultInput.dispose();
    namedInput.dispose();
  });

  it("keeps inactive controls focusable while blocking edits and preserving bubbling", () => {
    const onParentInput = vi.fn();
    const onValueChange = vi.fn();
    const { dispose, element } = renderTextInput(() => (
      <div onInput={onParentInput}>
        <TextInput disabled onValueChange={onValueChange} value="Locked" />
      </div>
    ));

    element.value = "Changed";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));

    expect(element.getAttribute("aria-disabled")).toBe("true");
    expect(element.hasAttribute("disabled")).toBe(false);
    expect(element.tabIndex).toBe(0);
    expect(element.value).toBe("Locked");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onParentInput).toHaveBeenCalledOnce();

    dispose();
  });
});
