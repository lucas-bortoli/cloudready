// @vitest-environment happy-dom

import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import Checkbox from "./Checkbox";

function renderCheckbox(checkbox: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(checkbox, container);
  const input = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const label = container.querySelector("label");
  const indicator = container.querySelector<HTMLElement>("[data-state]");

  if (!input || !label || !indicator) {
    throw new Error("Checkbox did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    indicator,
    input,
    label,
  };
}

describe("Checkbox", () => {
  it("renders a controlled native checkbox with a clickable children label", () => {
    const onCheckedChange = vi.fn();
    const { dispose, indicator, input, label } = renderCheckbox(() => (
      <Checkbox
        checked={false}
        class="custom-class"
        name="agreement"
        onCheckedChange={onCheckedChange}
        required
        value="yes"
      >
        Agree to terms
      </Checkbox>
    ));

    expect(input.checked).toBe(false);
    expect(input.name).toBe("agreement");
    expect(input.required).toBe(true);
    expect(input.value).toBe("yes");
    expect(label.textContent).toContain("Agree to terms");
    expect(label.className).toContain("custom-class");
    expect(indicator.dataset.state).toBe("unchecked");

    dispose();
  });

  it("reports the next checked state after activation", () => {
    const onCheckedChange = vi.fn();
    const { dispose, input } = renderCheckbox(() => (
      <Checkbox checked={false} onCheckedChange={onCheckedChange}>
        Enable feature
      </Checkbox>
    ));

    input.click();

    expect(onCheckedChange).toHaveBeenCalledWith(true);

    dispose();
  });

  it("synchronizes controlled checked and indeterminate state", () => {
    const [checked, setChecked] = createSignal(false);
    const [indeterminate, setIndeterminate] = createSignal(true);
    const { dispose, indicator, input } = renderCheckbox(() => (
      <Checkbox
        checked={checked()}
        indeterminate={indeterminate()}
        onCheckedChange={(nextChecked) => {
          setChecked(nextChecked);
          setIndeterminate(false);
        }}
      >
        Select all
      </Checkbox>
    ));

    expect(input.indeterminate).toBe(true);
    expect(input.getAttribute("aria-checked")).toBe("mixed");
    expect(indicator.dataset.state).toBe("mixed");

    input.click();

    expect(input.checked).toBe(true);
    expect(input.indeterminate).toBe(false);
    expect(input.hasAttribute("aria-checked")).toBe(false);
    expect(indicator.dataset.state).toBe("checked");

    dispose();
  });

  it("forwards x-role only when supplied", () => {
    const defaultCheckbox = renderCheckbox(() => (
      <Checkbox checked={false} onCheckedChange={() => undefined}>
        Default
      </Checkbox>
    ));
    const namedCheckbox = renderCheckbox(() => (
      <Checkbox checked={false} onCheckedChange={() => undefined} x-role="option checkbox">
        Named
      </Checkbox>
    ));

    expect(defaultCheckbox.input.hasAttribute("x-role")).toBe(false);
    expect(namedCheckbox.input.getAttribute("x-role")).toBe("option checkbox");

    defaultCheckbox.dispose();
    namedCheckbox.dispose();
  });

  it("keeps inactive checkboxes focusable while blocking changes and preserving bubbling", () => {
    const onCheckedChange = vi.fn();
    const onParentClick = vi.fn();
    const { dispose, input } = renderCheckbox(() => (
      <div onClick={onParentClick}>
        <Checkbox checked={false} disabled onCheckedChange={onCheckedChange}>
          Locked
        </Checkbox>
      </div>
    ));

    input.click();

    expect(input.getAttribute("aria-disabled")).toBe("true");
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(input.tabIndex).toBe(0);
    expect(input.checked).toBe(false);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(onParentClick).toHaveBeenCalledOnce();

    dispose();
  });
});
