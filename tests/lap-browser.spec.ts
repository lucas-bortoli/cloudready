import { expect, test } from "@playwright/test";

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
      await import("/programs/flashcards/components/subject/LessonBrowserFixture.tsx");
    fixture.mountLessonFixture(
      `<script>parent.__lessonScript = true</script><img src="https://example.invalid/tracker.png"><img id="local" src="assets/picture.svg"><svg id="inline"><circle cx="5" cy="5" r="5" /></svg><audio id="audio" controls src="assets/sound.mp3"></audio><a id="navigate" href="lap:item/next">Next</a><img src=x onerror="parent.__lessonEvent = true">`,
    );
  });
  const frame = page.frameLocator('iframe[title="Lesson"]');
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
