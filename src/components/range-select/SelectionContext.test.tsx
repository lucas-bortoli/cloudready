import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it } from "vitest";
import { SelectionProvider, useSelection } from "./SelectionContext";

function SelectionReader() {
  const selection = useSelection();
  return <span>{Array.from(selection.selectedItems()).join(",")}</span>;
}

it("uses the current selection accessor when the provider prop changes", async () => {
  const root = document.createElement("div");
  const { artifact } = await captureArtifact(
    () => {
      const first = () => new Set(["first"]);
      const second = () => new Set(["second"]);
      let changeAccessor = () => {};
      const dispose = render(() => {
        const [useSecond, setUseSecond] = createSignal(false);
        changeAccessor = () => setUseSecond(true);
        return (
          <SelectionProvider
            selectedItems={useSecond() ? second : first}
            setSelectedItems={() => {}}
          >
            <SelectionReader />
          </SelectionProvider>
        );
      }, root);
      expect(root.textContent).toBe("first");
      changeAccessor();
      flush();
      expect(root.textContent).toBe("second");
      dispose();
    },
    { scenario: "selection-provider-accessor-change" },
  );
  expectNoDiagnostics(artifact);
});
