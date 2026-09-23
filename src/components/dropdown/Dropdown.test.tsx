// @vitest-environment happy-dom

import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import Dropdown, { type DropdownOption } from "./Dropdown";

const options: DropdownOption[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { disabled: true, label: "System", value: "system" },
];

function renderDropdown(dropdown: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(dropdown, container);
  const element = container.querySelector<HTMLSelectElement>("select");

  if (!element) {
    throw new Error("Dropdown did not render.");
  }

  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    element,
  };
}

describe("Dropdown", () => {
  it("renders controlled native options and forwards safe native props", () => {
    const { dispose, element } = renderDropdown(() => (
      <Dropdown
        class="custom-class"
        name="theme"
        onValueChange={() => undefined}
        options={options}
        required
        value="dark"
      />
    ));

    expect(element.value).toBe("dark");
    expect(element.name).toBe("theme");
    expect(element.required).toBe(true);
    expect(element.className).toContain("h-7");
    expect(element.className).toContain("appearance-none");
    expect(element.className).toContain("custom-class");
    expect(element.parentElement?.className).toContain("justify-self-start");
    expect(
      element.parentElement?.querySelector("svg[aria-hidden='true']")?.getAttribute("class"),
    ).toContain("z-10");
    expect([...element.options].map((option) => option.text)).toEqual(["Light", "Dark", "System"]);
    expect(element.options[2].disabled).toBe(true);

    dispose();
  });

  it("reports an accepted requested value", () => {
    const onValueChange = vi.fn();
    const { dispose, element } = renderDropdown(() => (
      <Dropdown onValueChange={onValueChange} options={options} value="light" />
    ));

    element.value = "dark";
    element.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("dark");

    dispose();
  });

  it("synchronizes when its controlled value changes", () => {
    const [value, setValue] = createSignal("light");
    const { dispose, element } = renderDropdown(() => (
      <Dropdown onValueChange={setValue} options={options} value={value()} />
    ));

    setValue("dark");

    expect(element.value).toBe("dark");

    dispose();
  });

  it("forwards x-role only when supplied", () => {
    const defaultDropdown = renderDropdown(() => (
      <Dropdown onValueChange={() => undefined} options={options} value="light" />
    ));
    const namedDropdown = renderDropdown(() => (
      <Dropdown
        onValueChange={() => undefined}
        options={options}
        value="light"
        x-role="theme menu"
      />
    ));

    expect(defaultDropdown.element.hasAttribute("x-role")).toBe(false);
    expect(namedDropdown.element.getAttribute("x-role")).toBe("theme menu");

    defaultDropdown.dispose();
    namedDropdown.dispose();
  });

  it("keeps inactive Dropdowns focusable while blocking changes and preserving bubbling", () => {
    const onParentChange = vi.fn();
    const onValueChange = vi.fn();
    const { dispose, element } = renderDropdown(() => (
      <div onChange={onParentChange}>
        <Dropdown disabled onValueChange={onValueChange} options={options} value="light" />
      </div>
    ));

    element.value = "dark";
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));

    expect(element.getAttribute("aria-disabled")).toBe("true");
    expect(element.hasAttribute("disabled")).toBe(false);
    expect(element.tabIndex).toBe(0);
    expect(element.value).toBe("light");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onParentChange).toHaveBeenCalledOnce();

    dispose();
  });
});
