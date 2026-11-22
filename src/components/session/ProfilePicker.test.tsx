// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import ProfilePicker from "./ProfilePicker";
import { sessions, type UserId, type UserProfile } from "./SessionClient";

it("loads profiles and starts the selected session without Solid diagnostics", async () => {
  const profile: UserProfile = {
    id: "123" as UserId,
    displayName: "Ada",
    createdAt: new Date(),
    profilePicture: { mimeType: "image/png", size: 1 },
  };
  const profiles = vi.spyOn(sessions, "profiles").mockResolvedValue([profile]);
  const start = vi.spyOn(sessions, "start").mockResolvedValue(profile);
  const selected = vi.fn();
  const container = document.createElement("div");

  try {
    const { artifact } = await captureArtifact(
      async () => {
        const dispose = render(() => <ProfilePicker onSelected={selected} />, container);
        flush();
        await Promise.resolve();
        flush();
        const choice = container.querySelector<HTMLButtonElement>('[x-role="profile choice"]')!;
        expect(choice.textContent).toBe("Ada");
        expect(choice.firstElementChild?.getAttribute("style")).toContain(
          "/api/profile-picture/123",
        );
        choice.click();
        await Promise.resolve();
        expect(start).toHaveBeenCalledWith(profile.id);
        expect(selected).toHaveBeenCalledWith(profile);
        dispose();
      },
      { scenario: "profile-picker" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    profiles.mockRestore();
    start.mockRestore();
  }
});

it("shows profile loading errors", async () => {
  const profiles = vi.spyOn(sessions, "profiles").mockRejectedValue(new Error("Unavailable"));
  const container = document.createElement("div");
  try {
    const dispose = render(() => <ProfilePicker onSelected={() => {}} />, container);
    flush();
    await Promise.resolve();
    flush();
    expect(container.textContent).toContain("Unavailable");
    dispose();
  } finally {
    profiles.mockRestore();
  }
});
