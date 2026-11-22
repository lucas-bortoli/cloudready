// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import MachineIntelligenceWindow from "./MachineIntelligenceWindow";

const client = vi.hoisted(() => ({
  connection: vi.fn(),
  models: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("./MachineIntelligenceContext", () => ({ useClient: () => client }));

it("loads the connection and models on mount and sends a prompt", async () => {
  client.connection.mockResolvedValue({ connected: true, email: "user@example.com" });
  client.models.mockResolvedValue([{ slug: "model-1", displayName: "Model One" }]);
  client.generateText.mockResolvedValue("Answer");

  const { artifact } = await captureArtifact(
    async () => {
      const container = document.createElement("div");
      const dispose = render(() => <MachineIntelligenceWindow />, container);
      try {
        await vi.waitFor(() => {
          flush();
          expect(container.textContent).toContain("Connected: user@example.com");
          expect(container.querySelector("select")?.value).toBe("model-1");
        });
        const prompt = container.querySelector("textarea")!;
        prompt.value = "Hello";
        prompt.dispatchEvent(new Event("input", { bubbles: true }));
        flush();
        const send = [...container.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Send prompt"),
        )!;
        send.click();
        await vi.waitFor(() => {
          flush();
          expect(container.textContent).toContain("Answer");
        });
        expect(client.generateText).toHaveBeenCalledWith("model-1", "Hello");
      } finally {
        dispose();
      }
    },
    { scenario: "machine-intelligence-window" },
  );
  expectNoDiagnostics(artifact);
});
