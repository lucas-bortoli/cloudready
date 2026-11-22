import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it } from "vitest";
import FixedSidebar from "./FixedSidebar";

it("updates sidebar width classes without diagnostics", async () => {
  const root = document.createElement("div");
  const { artifact } = await captureArtifact(
    () => {
      let toggle = () => {};
      const dispose = render(() => {
        const [fill, setFill] = createSignal(false);
        toggle = () => setFill(true);
        return (
          <FixedSidebar
            fill={fill()}
            selectedItem={null}
            setSelectedItem={() => {}}
            class="custom"
          />
        );
      }, root);
      const sidebar = root.querySelector("aside")!;
      expect(sidebar.classList.contains("w-50")).toBe(true);
      expect(sidebar.classList.contains("custom")).toBe(true);
      toggle();
      flush();
      expect(sidebar.classList.contains("w-full")).toBe(true);
      expect(sidebar.classList.contains("w-50")).toBe(false);
      dispose();
    },
    { scenario: "sidebar-width" },
  );
  expectNoDiagnostics(artifact);
});
