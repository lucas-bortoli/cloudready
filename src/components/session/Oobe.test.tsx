// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import DEFAULT_PICTURES from "../../data/default-user-pictures/pictures";
import Oobe from "./Oobe";

vi.mock("../button/Button", () => ({
  default: (props: { children: unknown; onClick?: () => void }) => {
    const handleClick = () => props.onClick?.();
    return <button onClick={handleClick}>{props.children as string}</button>;
  },
}));
vi.mock("./oobe/EulaStep", () => ({ default: () => <p>License content</p> }));
vi.mock("./oobe/PrivacyPolicyStep", () => ({ default: () => <p>Privacy content</p> }));
vi.mock("./oobe/ProfileCreationStep", () => ({ default: () => <p>Profile creation</p> }));

it("warms profile pictures and advances from the welcome step without diagnostics", async () => {
  const fetchPicture = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
  const container = document.createElement("div");
  try {
    const { artifact } = await captureArtifact(
      async () => {
        const dispose = render(() => <Oobe onCreated={vi.fn()} />, container);
        flush();
        expect(fetchPicture).toHaveBeenCalledTimes(Object.values(DEFAULT_PICTURES).length);
        expect(container.textContent).toContain("Welcome to CloudReady");
        const button = Array.from(container.querySelectorAll("button")).find((element) =>
          element.textContent?.includes("Continue"),
        );
        expect(button).toBeDefined();
        button!.click();
        flush();
        expect(container.textContent).toContain("End User License Agreement");
        dispose();
      },
      { scenario: "profile-setup" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    fetchPicture.mockRestore();
  }
});
