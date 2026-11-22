// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it } from "vitest";
import ListBox from "./ListBox";

it("applies and updates caller classes while retaining its base classes", async () => {
  const { artifact } = await captureArtifact(async () => {
    const [className, setClassName] = createSignal("custom-one");
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <ListBox
          ariaLabel="Items"
          class={className()}
          items={[] as string[]}
          selected={null}
          label={(item) => item}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      ),
      container,
    );
    const list = container.querySelector('[role="listbox"]')!;
    expect(list.classList.contains("custom-one")).toBe(true);
    setClassName("custom-two");
    flush();
    expect(list.classList.contains("custom-one")).toBe(false);
    expect(list.classList.contains("custom-two")).toBe(true);
    expect(list.classList.contains("overflow-y-auto")).toBe(true);
    dispose();
  });
  expectNoDiagnostics(artifact);
});
