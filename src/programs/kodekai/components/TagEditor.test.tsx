// @vitest-environment happy-dom
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import TagEditor from "./TagEditor";

vi.mock("../../../components/button/Button", () => ({
  default: (props: {
    children?: import("@solidjs/web").JSX.Element;
    type?: "button" | "submit";
  }) => <button type={props.type}>{props.children}</button>,
}));

vi.mock("../../../components/text-input/TextInput", () => ({
  default: (props: { ref?: (element: HTMLTextAreaElement) => void }) => (
    <textarea ref={props.ref} />
  ),
}));

it("focuses the tag input after mounting", async () => {
  const { artifact } = await captureArtifact(async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(
      () => (
        <TagEditor
          tags={[]}
          onClose={vi.fn()}
          onCreate={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      ),
      root,
    );
    flush();
    expect(document.activeElement).toBe(root.querySelector("textarea"));
    dispose();
    root.remove();
  });
  expectNoDiagnostics(artifact);
});
