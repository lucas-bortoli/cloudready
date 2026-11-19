import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("isolates lesson scripts and remote resources while allowing navigation and assets", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.invalid")) external.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const fixture =
      await import("/programs/flashcards/pages/subjects/pages/items/pages/lesson/components/LessonBrowserFixture.tsx");
    fixture.mountLessonFixture(
      `<script>parent.__lessonScript = true</script><img src="https://example.invalid/tracker.png"><img id="local" src="assets/picture.svg"><svg id="inline"><circle cx="5" cy="5" r="5" /></svg><audio id="audio" controls src="assets/sound.mp3"></audio><a id="navigate" href="lap:item/next">Next</a><img src=x onerror="parent.__lessonEvent = true">`,
    );
  });
  const frame = page.frameLocator('iframe[title="Lesson"]');
  await expect(frame.locator("body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(frame.locator("body")).toHaveCSS("font-family", /Inter Display/);
  expect(
    await frame.locator("body").evaluate(async (body) => {
      await body.ownerDocument.fonts.ready;
      return Array.from(body.ownerDocument.fonts).map((font) => `${font.family}: ${font.status}`);
    }),
  ).toEqual(["Inter Display: loaded"]);
  await expect(frame.locator("#local")).toHaveJSProperty("complete", true);
  await expect(frame.locator("#inline circle")).toHaveCount(1);
  await expect(frame.locator("#audio")).toHaveAttribute("src", /^blob:/);
  await frame.locator("#navigate").click();
  await expect(page.locator('[data-selected="next"]')).toHaveCount(1);
  expect(
    await page.evaluate(() => [
      (window as unknown as Record<string, unknown>).__lessonScript,
      (window as unknown as Record<string, unknown>).__lessonEvent,
    ]),
  ).toEqual([undefined, undefined]);
  expect(external).toEqual([]);
});

test("the lesson frame shows the surrounding page background", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.innerHTML = "";
    document.body.style.background = "rgb(20, 160, 80)";
    const fixture =
      await import("/programs/flashcards/pages/subjects/pages/items/pages/lesson/components/LessonBrowserFixture.tsx");
    fixture.mountLessonFixture("");
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Lesson"]')!;
    frame.style.height = "200px";
    frame.style.width = "300px";
  });
  const frame = page.locator('iframe[title="Lesson"]');
  await expect(page.frameLocator('iframe[title="Lesson"]').locator("body")).toHaveCSS(
    "font-family",
    /Inter Display/,
  );
  const clip = (await frame.boundingBox())!;
  const visible = await page.screenshot({ clip });
  await frame.evaluate((element) => (element.style.visibility = "hidden"));
  const hidden = await page.screenshot({ clip });
  expect(visible.equals(hidden)).toBe(true);
});

test("a lesson opened through LAP blends into its content panel", async ({ page }) => {
  const sample = await readFile("spanish-starter.lap");
  await page.goto("/");
  await page.evaluate(async (bytes) => {
    document.body.innerHTML = "";
    const fixture =
      await import("/programs/flashcards/pages/subjects/pages/items/pages/lesson/components/LessonBrowserFixture.tsx");
    fixture.mountLapFixture(new Blob([new Uint8Array(bytes)]));
  }, Array.from(sample));
  await page.getByRole("button", { name: "Open subject" }).click();
  await page.getByRole("option", { name: "spanish-starter.lap" }).click();
  await page.getByRole("button", { name: "Confirm Selection" }).click();
  await page.getByRole("button", { name: "Be polite" }).click();
  const frame = page.locator('iframe[title="Lesson"]');
  await expect(
    page.frameLocator('iframe[title="Lesson"]').getByText("Everyday phrases"),
  ).toBeVisible();
  await expect
    .poll(() =>
      frame.evaluate(
        (element) =>
          getComputedStyle(element.closest("main")!).backgroundColor ===
          getComputedStyle(element.contentDocument!.documentElement).backgroundColor,
      ),
    )
    .toBe(true);
  const bounds = (await frame.boundingBox())!;
  const clip = {
    x: bounds.x + bounds.width - 30,
    y: bounds.y + bounds.height - 30,
    width: 20,
    height: 20,
  };
  const visible = await page.screenshot({ clip });
  await frame.evaluate((element) => (element.style.visibility = "hidden"));
  const hidden = await page.screenshot({ clip });
  expect(visible.equals(hidden)).toBe(true);
});
