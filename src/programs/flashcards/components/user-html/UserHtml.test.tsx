import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { UserHtml } from "./UserHtml";

const subjectAccessor = vi.hoisted(() => vi.fn((): unknown => undefined));
vi.mock("../subjects/useCurrentSubject", () => ({
  useOptionalCurrentSubject: () => subjectAccessor,
}));

it("replaces sanitized content when HTML changes and handles links", async () => {
  const container = document.createElement("div");
  const select = vi.fn();
  const { artifact } = await captureArtifact(
    async () => {
      let setHtml!: (value: string) => string;
      const dispose = render(() => {
        const [html, updateHtml] = createSignal(
          '<p>First</p><a href="https://example.com">Link</a>',
        );
        setHtml = updateHtml;
        return <UserHtml title="Content" html={html()} onSelect={select} />;
      }, container);
      flush();
      await Promise.resolve();
      flush();
      const root = container.firstElementChild!.shadowRoot!;
      expect(root.querySelector(".content-body")?.textContent).toContain("First");
      expect(root.querySelector("a")?.getAttribute("data-lap-link")).toBe("https://example.com");
      setHtml("<p>Second</p>");
      flush();
      await Promise.resolve();
      flush();
      expect(root.querySelector(".content-body")?.textContent).toBe("Second");
      dispose();
    },
    { scenario: "user-html-content-lifecycle" },
  );
  expectNoDiagnostics(artifact);
});

it("cancels pending assets and revokes URLs when content changes or closes", async () => {
  let pendingSignal: AbortSignal | undefined;
  let finishPending!: () => void;
  const pendingStream = new ReadableStream<Uint8Array>({
    start(controller) {
      finishPending = () => controller.close();
    },
  });
  const openStream = vi.fn(({ signal }: { signal: AbortSignal }) => {
    pendingSignal = signal;
    return pendingStream;
  });
  const subject = { getAsset: () => ({ openStream }) };
  subjectAccessor.mockReturnValue(subject);
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  try {
    const { artifact } = await captureArtifact(
      async () => {
        let setHtml!: (value: string) => string;
        const container = document.createElement("div");
        const dispose = render(() => {
          const [html, updateHtml] = createSignal('<p>Media</p><img src="assets/pending.png">');
          setHtml = updateHtml;
          return <UserHtml title="Content" html={html()} onSelect={() => {}} />;
        }, container);
        flush();
        await vi.waitFor(() => expect(openStream).toHaveBeenCalledOnce());
        setHtml("<p>Replacement</p>");
        flush();
        expect(pendingSignal?.aborted).toBe(true);
        finishPending();
        await vi.waitFor(() => {
          flush();
          expect(container.firstElementChild?.shadowRoot?.textContent).toContain("Replacement");
        });
        expect(createUrl).not.toHaveBeenCalled();

        openStream.mockImplementation(() => new Blob(["asset"]).stream());
        setHtml('<p>Media</p><img src="assets/loaded.png">');
        flush();
        await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
        setHtml("<p>Next</p>");
        flush();
        expect(revokeUrl).toHaveBeenCalledWith("blob:test");

        setHtml('<p>Media</p><img src="assets/loaded.png">');
        flush();
        await vi.waitFor(() => expect(createUrl).toHaveBeenCalledTimes(2));
        dispose();
        expect(revokeUrl).toHaveBeenCalledTimes(2);
      },
      { scenario: "user-html-asset-cleanup" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    subjectAccessor.mockReset();
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  }
});
