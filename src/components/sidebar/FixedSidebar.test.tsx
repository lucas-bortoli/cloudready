import Education16 from "@carbon/icons/es/education/16.js";
import { createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { expect, it } from "vitest";
import FixedSidebar from "./FixedSidebar";
import { SidebarItem } from "./SidebarItem";

it("highlights only the selected item and updates selection on click", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(() => {
    const [selected, setSelected] = createSignal<string | null>("first");
    return (
      <FixedSidebar selectedItem={selected()} setSelectedItem={setSelected}>
        <SidebarItem itemKey="first" label="First" icon={Education16} />
        <SidebarItem itemKey="second" label="Second" icon={Education16} />
      </FixedSidebar>
    );
  }, root);
  const [first, second] = root.querySelectorAll("button");
  expect(first.hasAttribute("data-selected")).toBe(true);
  expect(second.hasAttribute("data-selected")).toBe(false);
  second.click();
  flush();
  expect(first.hasAttribute("data-selected")).toBe(false);
  expect(second.hasAttribute("data-selected")).toBe(true);
  dispose();
  root.remove();
});
