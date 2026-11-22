import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const fixtureUrl = `/@fs${fileURLToPath(new URL("../../tests/fixtures/LapBrowserFixture.tsx", import.meta.url))}`;

const diagnostics = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  diagnostics.set(page, messages);
  page.on("console", (message) => {
    if (/\[[A-Z][A-Z_]+\]/.test(message.text())) messages.push(message.text());
  });
  await page.addInitScript((url) => Reflect.set(window, "lapFixtureUrl", url), fixtureUrl);
});

test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)).toEqual([]);
});

test("reviews LAP cards, preserves the draft across navigation, and reopens saved progress", async ({
  page,
}) => {
  const sample = await readFile("spanish-starter.lap");
  await page.goto("/");
  await page.evaluate(async (bytes) => {
    document.body.innerHTML = "";
    const { mountLapFixture } = await import(Reflect.get(window, "lapFixtureUrl"));
    const filesystemUrl = "/filesystem/FileSystemClient.ts";
    const { filesystem } = await import(filesystemUrl);
    const packageUrl = "/programs/flashcards/core/subject-package/package.ts";
    const { openSubjectPackage, writeSubjectPackage } = await import(packageUrl);
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
      '<img id="local" src="assets/sun.svg"><audio controls src="assets/chime.wav"></audio><img id="missing" src="assets/missing.svg">';
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
  const content = page.getByRole("group", { name: "Flashcard" });
  await expect(page.getByText("2 cards · 0 due · 2 new available")).toBeVisible();
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(content.getByText("Hello")).toBeVisible();
  await expect(content.locator("#local")).toHaveAttribute("src", /^blob:/);
  await expect(content.locator("audio")).toHaveAttribute("src", /^blob:/);
  await expect(content.locator("#missing")).not.toHaveAttribute("src");
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(content.getByText("Hola")).toBeVisible();
  await expect(content.getByRole("link", { name: "Lesson link" })).toBeVisible();
  await expect(content.locator("#local")).toHaveCount(0);
  await content.getByRole("link", { name: "Lesson link" }).click();
  await expect(
    page.getByRole("group", { name: "Lesson" }).getByText("Everyday phrases"),
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
  await expect(content.getByText("Thank you")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(content.getByText("Hello")).toBeVisible();
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
  await expect(content.getByText("Thank you")).toBeVisible();
});

test("animates a revealed card and respects reduced motion", async ({ page }) => {
  const sample = await readFile("spanish-starter.lap");
  await page.goto("/");
  await page.evaluate(async (bytes) => {
    const { mountLapFixture } = await import(Reflect.get(window, "lapFixtureUrl"));
    mountLapFixture(new Blob([new Uint8Array(bytes)]));
  }, Array.from(sample));
  await page.getByRole("button", { name: "Add Subject..." }).click();
  await page.getByRole("option", { name: "spanish-starter.lap" }).click();
  await page.getByRole("button", { name: "Confirm Selection" }).click();
  await page.getByRole("button", { name: "Greeting cards" }).first().click();
  await page.getByRole("button", { name: "Start review" }).click();
  const card = page.getByRole("group", { name: "Flashcard" }).locator("../..");
  const animationNames = () =>
    card.evaluate((element) =>
      element.getAnimations().flatMap((animation) => {
        if (animation instanceof CSSAnimation) return [animation.animationName];
        return [];
      }),
    );
  expect(await animationNames()).toEqual([expect.stringContaining("flashcard-enter")]);
  const visibleImmediately = await page
    .getByRole("button", { name: "Show answer" })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      return document.querySelector('[aria-label="Flashcard"]')?.shadowRoot?.textContent;
    });
  expect(visibleImmediately).toContain("Hello");
  await expect.poll(animationNames).toContainEqual(expect.stringContaining("flashcard-flip"));
  await expect(card.getByText("Hola")).toBeVisible();
  const afterRating = await page.getByRole("button", { name: /^Good/ }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    return {
      queue: document.querySelector('[x-role="flashcard-deck"] [role="status"]')?.textContent,
      face: document.querySelector('[aria-label="Flashcard"]')?.shadowRoot?.textContent,
    };
  });
  expect(afterRating.queue).toContain("1 new available");
  expect(afterRating.face).toContain("Hola");
  await expect.poll(animationNames).toContainEqual(expect.stringContaining("flashcard-leave"));
  await expect(card.getByText("Thank you")).toBeVisible();
  expect(await animationNames()).toEqual([expect.stringContaining("flashcard-enter")]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card.getByText("Hello")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(animationNames).toEqual([]);
  const reviewPanel = page.locator('[x-role="flashcard-deck"]');
  const reviewHeight = await reviewPanel.evaluate((element) => element.scrollHeight);
  const cardHeight = await card.evaluate((element) => element.clientHeight);
  for (const answer of ["Hola", "Gracias"]) {
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(card.getByText(answer)).toBeVisible();
    await page.getByRole("button", { name: /^Good/ }).click();
  }
  const completion = page.getByRole("heading", { name: "Review complete!" });
  await expect(completion).toBeVisible();
  await expect(page.getByText("2 cards reviewed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show answer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Good/ })).toHaveCount(0);
  expect(await completion.locator("../../..").evaluate((element) => element.clientHeight)).toBe(
    cardHeight,
  );
  expect(await reviewPanel.evaluate((element) => element.scrollHeight)).toBe(reviewHeight);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card.getByText("Thank you")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(page.getByText("2 cards reviewed")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All caught up" })).toBeVisible();
});
