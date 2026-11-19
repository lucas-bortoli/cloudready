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
  await expect(frame.locator("body")).toHaveCSS("font-family", /Inter Variable/);
  expect(
    await frame.locator("body").evaluate(async (body) => {
      await body.ownerDocument.fonts.ready;
      return Array.from(body.ownerDocument.fonts).map((font) => `${font.family}: ${font.status}`);
    }),
  ).toEqual(["Inter Variable: loaded"]);
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
    /Inter Variable/,
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
  await page.getByRole("button").filter({ hasText: "Add Subject..." }).click();
  await page.getByRole("option", { name: "spanish-starter.lap" }).click();
  await page.getByRole("button", { name: "Confirm Selection" }).click();
  await page.getByRole("complementary").getByRole("button", { name: "Be polite" }).click();
  const frame = page.locator('iframe[title="Lesson"]');
  await expect(
    page.frameLocator('iframe[title="Lesson"]').getByText("Everyday phrases"),
  ).toBeVisible();
  await expect(page.frameLocator('iframe[title="Lesson"]').locator("html")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
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

test("reviews LAP cards, preserves the draft across navigation, and reopens saved progress", async ({
  page,
}) => {
  const sample = await readFile("spanish-starter.lap");
  await page.goto("/");
  await page.evaluate(async (bytes) => {
    document.body.innerHTML = "";
    const { mountLapFixture } =
      await import("/programs/flashcards/pages/subjects/pages/items/pages/lesson/components/LessonBrowserFixture.tsx");
    const { filesystem } = await import("/filesystem/FileSystemClient.ts");
    const { openSubjectPackage, writeSubjectPackage } =
      await import("/programs/flashcards/core/subject-package/package.ts");
    const subject = await openSubjectPackage(new Blob([new Uint8Array(bytes)]));
    const findDeck = (
      items: typeof subject.content.topics,
    ): Extract<(typeof items)[number], { type: "flashcard-deck" }> | undefined => {
      for (const item of items) {
        if (item.type === "flashcard-deck") return item;
        if (item.type === "topic") {
          const deck = findDeck(item.items);
          if (deck) return deck;
        }
      }
    };
    const greetings = subject.content.topics[0];
    if (greetings.type !== "topic") throw new Error("Expected the Greetings topic.");
    greetings.items.push({
      type: "flashcard-deck",
      id: "extra-deck",
      title: "Extra cards",
      cards: [{ id: "extra-card", front: "<p>Good morning</p>", back: "<p>Buenos días</p>" }],
    });
    const deck = findDeck(subject.content.topics)!;
    deck.cards[0].front +=
      '<img id="local" src="assets/sun.svg"><audio controls src="assets/chime.wav"></audio><img src="assets/missing.svg">';
    deck.cards[0].back += '<a href="lap:item/polite">Lesson link</a>';
    const stream = new TransformStream();
    const [archive] = await Promise.all([
      new Response(stream.readable).blob(),
      writeSubjectPackage(subject, stream.writable),
    ]);
    await subject.close();
    const dispose = mountLapFixture(archive);
    Reflect.set(window, "reopenReviewFixture", async () => {
      const saved = await filesystem.readFile("/spanish-starter.lap");
      dispose();
      mountLapFixture(saved);
    });
  }, Array.from(sample));

  const openDeck = async () => {
    await page.getByRole("button").filter({ hasText: "Add Subject..." }).click();
    await page.getByRole("option", { name: "spanish-starter.lap" }).click();
    await page.getByRole("button", { name: "Confirm Selection" }).click();
    await page.getByRole("button").filter({ hasText: "Greeting cards" }).first().click();
  };

  await openDeck();
  const frame = page.frameLocator('iframe[title="Flashcard"]');
  await expect(page.getByText("2 cards · 0 due · 2 new available")).toBeVisible();
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(frame.getByText("Hello")).toBeVisible();
  await expect(frame.locator("#local")).toHaveAttribute("src", /^blob:/);
  await expect(frame.locator("audio")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByText("Some assets could not be loaded.")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(frame.getByText("Hola")).toBeVisible();
  await expect(frame.getByRole("link", { name: "Lesson link" })).toBeVisible();
  await expect(frame.locator("#local")).toHaveCount(0);
  await frame.getByRole("link", { name: "Lesson link" }).click();
  await expect(
    page.frameLocator('iframe[title="Lesson"]').getByText("Everyday phrases"),
  ).toBeVisible();
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "Greetings", exact: true })
    .click();
  await page.getByRole("button", { name: "Review all decks" }).click();
  await expect(page.getByText("3 cards · 0 due · 3 new available")).toBeVisible();
  await expect(page.locator('[x-role="flashcard-deck"]').getByText("Greeting cards")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(frame.getByText("Thank you")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.getByText("Hello")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByRole("button", { name: /^Easy/ }).click();
  await page.getByRole("button", { name: "End review" }).click();
  await expect(page.getByRole("button", { name: "Review all decks" })).toBeVisible();

  await page.getByRole("button").filter({ hasText: "Be polite" }).first().click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button").filter({ hasText: "Greeting cards" }).first().click();
  await expect(page.getByText("2 cards · 0 due · 1 new available")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-saved]")).toHaveCount(1);
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  await page.evaluate(() => Reflect.get(window, "reopenReviewFixture")());
  await openDeck();
  await expect(page.getByText("2 cards · 0 due · 1 new available")).toBeVisible();
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(frame.getByText("Thank you")).toBeVisible();
});

test("changing the visible card side aborts a pending asset read", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { mountPendingCardFixture } =
      await import("/programs/flashcards/pages/subjects/pages/items/pages/lesson/components/LessonBrowserFixture.tsx");
    mountPendingCardFixture();
  });
  await expect(page.locator('[data-asset="loading"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Flip fixture card" }).click();
  await expect(page.locator('[data-asset="aborted"]')).toHaveCount(1);
  await expect(page.frameLocator('iframe[title="Flashcard"]').getByText("Back")).toBeVisible();
  await expect(page.getByText("Some assets could not be loaded.")).toHaveCount(0);
});
