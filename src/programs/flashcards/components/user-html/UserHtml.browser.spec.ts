import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixtureUrl = `/@fs${fileURLToPath(new URL("../../tests/fixtures/LapBrowserFixture.tsx", import.meta.url))}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => Reflect.set(window, "lapFixtureUrl", url), fixtureUrl);
});

test("isolates lesson scripts and remote resources while allowing navigation and assets", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.invalid")) external.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const fixture = await import(Reflect.get(window, "lapFixtureUrl"));
    fixture.mountLessonFixture(
      `<style>#styled { color: rgb(1, 2, 3); background-image: url(https://example.invalid/css.png); } :host { display: none; }</style><p id="styled">Styled content</p><script>parent.__lessonScript = true</script><img src="https://example.invalid/tracker.png"><img id="local" src="assets/picture.svg"><svg id="inline"><circle cx="5" cy="5" r="5" /></svg><audio id="audio" controls src="assets/sound.mp3"></audio><a id="navigate" href="lap:item/next">Next</a><img src=x onerror="parent.__lessonEvent = true">`,
    );
  });
  const content = page.getByRole("group", { name: "Lesson" });
  await expect(content.locator(".content-body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(content.locator(".content-body")).toHaveCSS("font-family", /Inter Variable/);
  expect(
    await content.locator(".content-body").evaluate(async (body) => {
      await body.ownerDocument.fonts.ready;
      return Array.from(body.ownerDocument.fonts).map((font) => `${font.family}: ${font.status}`);
    }),
  ).toContain("Inter Variable: loaded");
  await expect(content.locator("#styled")).toHaveCSS("color", "rgb(1, 2, 3)");
  await expect(content.locator("#styled")).toHaveCSS("background-image", "none");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(content.locator("#local")).toHaveJSProperty("complete", true);
  await expect(content.locator("#inline circle")).toHaveCount(1);
  await expect(content.locator("#audio")).toHaveAttribute("src", /^blob:/);
  await content.locator("#navigate").click();
  await expect(page.locator('[data-selected="next"]')).toHaveCount(1);
  expect(
    await page.evaluate(() => [
      (window as unknown as Record<string, unknown>).__lessonScript,
      (window as unknown as Record<string, unknown>).__lessonEvent,
    ]),
  ).toEqual([undefined, undefined]);
  expect(external).toEqual([]);
});

test("the lesson content shows the surrounding page background", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.innerHTML = "";
    document.body.style.background = "rgb(20, 160, 80)";
    const fixture = await import(Reflect.get(window, "lapFixtureUrl"));
    fixture.mountLessonFixture("");
    const content = document.querySelector<HTMLDivElement>('[aria-label="Lesson"]')!;
    content.style.height = "200px";
    content.style.width = "300px";
  });
  const content = page.getByRole("group", { name: "Lesson" });
  await expect(page.getByRole("group", { name: "Lesson" }).locator(".content-body")).toHaveCSS(
    "font-family",
    /Inter Variable/,
  );
  const clip = (await content.boundingBox())!;
  const visible = await page.screenshot({ clip });
  await content.evaluate((element) => (element.style.visibility = "hidden"));
  const hidden = await page.screenshot({ clip });
  expect(visible.equals(hidden)).toBe(true);
});

test("changing the visible card side aborts a pending asset read", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { mountPendingCardFixture } = await import(Reflect.get(window, "lapFixtureUrl"));
    mountPendingCardFixture();
  });
  await expect(page.locator('[data-asset="loading"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Flip fixture card" }).click();
  await expect(page.locator('[data-asset="aborted"]')).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Flashcard" }).getByText("Back")).toBeVisible();
  await expect(page.getByText("Some assets could not be loaded.")).toHaveCount(0);
});
