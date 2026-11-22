// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { useLegalDocument } from "./useLegalDocument";

it("reports document readiness and ignores a pending load after disposal", async () => {
  let resolveLoad!: (value: string) => void;
  const load = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      }),
  );
  const ready = vi.fn();
  const container = document.createElement("div");

  function Test() {
    const legal = useLegalDocument(load, ready);
    return <p>{legal.document()}</p>;
  }

  const { artifact } = await captureArtifact(
    async () => {
      const dispose = render(() => <Test />, container);
      flush();
      expect(ready).toHaveBeenCalledWith(false);
      resolveLoad("Terms");
      await Promise.resolve();
      flush();
      expect(container.textContent).toBe("Terms");
      expect(ready).toHaveBeenLastCalledWith(true);
      dispose();

      const disposePending = render(() => <Test />, container);
      flush();
      disposePending();
      resolveLoad("Late terms");
      await Promise.resolve();
      flush();
      expect(ready).toHaveBeenCalledTimes(3);
    },
    { scenario: "legal-document-loading" },
  );
  expectNoDiagnostics(artifact);
});

it("exposes load errors without marking the document ready", async () => {
  const failure = new Error("Unavailable");
  const ready = vi.fn();
  const container = document.createElement("div");

  function Test() {
    const legal = useLegalDocument(() => Promise.reject(failure), ready);
    return <p>{String(legal.error())}</p>;
  }

  const { artifact } = await captureArtifact(
    async () => {
      const dispose = render(() => <Test />, container);
      flush();
      await Promise.resolve();
      flush();
      expect(container.textContent).toContain("Unavailable");
      expect(ready).toHaveBeenCalledExactlyOnceWith(false);
      dispose();
    },
    { scenario: "legal-document-error" },
  );
  expectNoDiagnostics(artifact);
});
