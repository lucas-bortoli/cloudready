import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const fixtureUrl = `/@fs${fileURLToPath(new URL("../../../../../../tests/fixtures/LapBrowserFixture.tsx", import.meta.url))}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => Reflect.set(window, "lapFixtureUrl", url), fixtureUrl);
});

test("a lesson opened through LAP blends into its content panel", async ({ page }) => {
  const sample = await readFile("spanish-starter.lap");
  await page.goto("/");
  await page.evaluate(async (bytes) => {
    document.body.innerHTML = "";
    const fixture = await import(Reflect.get(window, "lapFixtureUrl"));
    fixture.mountLapFixture(new Blob([new Uint8Array(bytes)]));
  }, Array.from(sample));
  await page.getByRole("button").filter({ hasText: "Add Subject..." }).click();
  await page.getByRole("option", { name: "spanish-starter.lap" }).click();
  await page.getByRole("button", { name: "Confirm Selection" }).click();
  await page.getByRole("complementary").getByRole("button", { name: "Be polite" }).click();
  const content = page.getByRole("group", { name: "Lesson" });
  await expect(
    page.getByRole("group", { name: "Lesson" }).getByText("Everyday phrases"),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Lesson" }).locator(".content-body")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  const bounds = (await content.boundingBox())!;
  const clip = {
    x: bounds.x + bounds.width - 30,
    y: bounds.y + bounds.height - 30,
    width: 20,
    height: 20,
  };
  const visible = await page.screenshot({ clip });
  await content.evaluate((element) => (element.style.visibility = "hidden"));
  const hidden = await page.screenshot({ clip });
  expect(visible.equals(hidden)).toBe(true);
});
