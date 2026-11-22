import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixtureUrl = `/@fs${fileURLToPath(new URL("../../components/window-manager/WindowDiagnosticsFixture.tsx", import.meta.url))}`;

for (const scenario of ["dialog", "kodekai"] as const) {
  test(`${scenario} window settles without reactive diagnostics in Chromium`, async ({ page }) => {
    await page.goto("/components/window-manager/window-diagnostics.html");
    const result = await page.evaluate(
      async ({ url, scenario }) => {
        const fixture = await import(/* @vite-ignore */ url);
        return fixture.captureWindowScenario(scenario);
      },
      { url: fixtureUrl, scenario },
    );
    expect(result.position).toBeDefined();
    expect(result.position.x).toBe(result.position.expectedX);
    expect(result.position.y).toBe(result.position.expectedY);
    expect(result.artifact.diagnostics).toEqual([]);
  });
}
