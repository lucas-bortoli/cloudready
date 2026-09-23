// @vitest-environment happy-dom

import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import Radio from "./Radio";
import RadioGroup, { RadioGroupContextError } from "./RadioGroup";

function renderRadio(content: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(content, container);
  const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

  if (inputs.length === 0) {
    throw new Error("Radio did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    inputs,
  };
}

describe("Radio", () => {
  it("shares a native name without RadioGroup rendering a wrapper", () => {
    const { dispose, inputs } = renderRadio(() => (
      <RadioGroup name="theme" onValueChange={() => undefined} value="light">
        <Radio class="custom-class" required value="light">
          Light
        </Radio>
        <Radio value="dark">Dark</Radio>
      </RadioGroup>
    ));

    expect(inputs).toHaveLength(2);
    expect(inputs[0].name).toBe("theme");
    expect(inputs[1].name).toBe("theme");
    expect(inputs[0].required).toBe(true);
    expect(inputs[0].parentElement?.className).toContain("custom-class");
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);

    dispose();
  });

  it("reports an unselected option once and ignores the selected option", () => {
    const onValueChange = vi.fn();
    const { dispose, inputs } = renderRadio(() => (
      <RadioGroup name="theme" onValueChange={onValueChange} value="light">
        <Radio value="light">Light</Radio>
        <Radio value="dark">Dark</Radio>
      </RadioGroup>
    ));

    inputs[0].click();
    inputs[1].click();

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("dark");

    dispose();
  });

  it("synchronizes selected state and its decorative dot", () => {
    const [value, setValue] = createSignal("light");
    const { dispose, inputs } = renderRadio(() => (
      <RadioGroup name="theme" onValueChange={setValue} value={value()}>
        <Radio value="light">Light</Radio>
        <Radio value="dark">Dark</Radio>
      </RadioGroup>
    ));
    const indicators = document.body.querySelectorAll<HTMLElement>("[data-state]");

    setValue("dark");

    expect(inputs[0].checked).toBe(false);
    expect(inputs[1].checked).toBe(true);
    expect(indicators[0].dataset.state).toBe("unchecked");
    expect(indicators[1].dataset.state).toBe("checked");
    expect(indicators[1].querySelector("span")).not.toBeNull();

    dispose();
  });

  it("forwards x-role only when supplied", () => {
    const { dispose, inputs } = renderRadio(() => (
      <RadioGroup name="theme" onValueChange={() => undefined} value="light">
        <Radio value="light">Light</Radio>
        <Radio value="dark" x-role="theme option">
          Dark
        </Radio>
      </RadioGroup>
    ));

    expect(inputs[0].hasAttribute("x-role")).toBe(false);
    expect(inputs[1].getAttribute("x-role")).toBe("theme option");

    dispose();
  });

  it("blocks inactive options while allowing active siblings to report selection", () => {
    const onValueChange = vi.fn();
    const onParentClick = vi.fn();
    const { dispose, inputs } = renderRadio(() => (
      <div onClick={onParentClick}>
        <RadioGroup name="theme" onValueChange={onValueChange} value="light">
          <Radio value="light">Light</Radio>
          <Radio disabled value="dark">
            Dark
          </Radio>
          <Radio value="system">System</Radio>
        </RadioGroup>
      </div>
    ));

    inputs[1].click();

    expect(inputs[1].getAttribute("aria-disabled")).toBe("true");
    expect(inputs[1].hasAttribute("disabled")).toBe(false);
    expect(inputs[1].tabIndex).toBe(0);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onParentClick).toHaveBeenCalledOnce();

    const arrowEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    inputs[1].dispatchEvent(arrowEvent);

    expect(arrowEvent.defaultPrevented).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();

    inputs[2].click();

    expect(onValueChange).toHaveBeenCalledWith("system");

    dispose();
  });

  it("throws a named error outside RadioGroup", () => {
    expect(() => renderRadio(() => <Radio value="light">Light</Radio>)).toThrow(
      RadioGroupContextError,
    );
  });
});
