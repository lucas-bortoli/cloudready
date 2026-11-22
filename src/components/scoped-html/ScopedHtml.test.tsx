import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it } from "vitest";
import { ScopedHtml } from "./ScopedHtml";

it("updates scoped content and styles when its props change", async () => {
  const container = document.createElement("div");
  const { artifact } = await captureArtifact(
    () => {
      const first = document.createElement("div");
      first.innerHTML = "<p>First</p>";
      const second = document.createElement("div");
      second.innerHTML = "<p>Second</p>";
      const [content, setContent] = createSignal({ body: first, css: "p { color: red; }" });
      const [bodyClass, setBodyClass] = createSignal("initial");
      const [baseCss, setBaseCss] = createSignal("p { margin: 0; }");
      const dispose = render(
        () => (
          <ScopedHtml
            title="Content"
            content={content()}
            bodyClass={bodyClass()}
            baseCss={baseCss()}
          />
        ),
        container,
      );
      flush();
      const root = container.firstElementChild!.shadowRoot!;
      expect(root.querySelector(".content-body")?.textContent).toBe("First");
      expect(root.querySelector(".content-body")?.className).toBe("content-body initial");
      setContent({ body: second, css: "p { color: blue; }" });
      setBodyClass("updated");
      setBaseCss("p { margin: 1px; }");
      flush();
      expect(root.querySelector(".content-body")?.textContent).toBe("Second");
      expect(root.querySelector(".content-body")?.className).toBe("content-body updated");
      expect(root.querySelectorAll("style")[0].textContent).toContain("margin: 1px");
      expect(root.querySelectorAll("style")[1].textContent).toContain("color: blue");
      dispose();
    },
    { scenario: "scoped-html-updates" },
  );
  expectNoDiagnostics(artifact);
});
