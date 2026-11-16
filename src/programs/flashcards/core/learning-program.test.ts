import { describe, expect, it } from "vitest";
import type { Topic, TopicItem } from "./learning-program";
import {
  emptySubject,
  exampleContent,
  exampleManifest,
  exampleProgress,
  sharedSubject,
} from "./learning-program.example";

describe("learning program examples", () => {
  it("uses unique content IDs and resolves internal links and choice answers", () => {
    const ids = new Set<string>();
    const links: string[] = [];
    const add = (id: string) => {
      expect(id).not.toBe("");
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    };
    const visit = (item: TopicItem) => {
      add(item.id);
      if (item.type === "topic") item.items.forEach(visit);
      if (item.type === "lesson") {
        for (const match of item.html.matchAll(/href="lap:item\/([^"#]+)"/g)) links.push(match[1]);
      }
      if (item.type === "exercise-set") {
        for (const exercise of item.exercises) {
          add(exercise.id);
          if (exercise.type === "multiple-choice") {
            const choices = exercise.choices.map((choice) => choice.id);
            expect(new Set(choices).size).toBe(choices.length);
            expect(choices).toContain(exercise.correctChoiceId);
          }
        }
      }
      if (item.type === "flashcard-deck") item.cards.forEach((card) => add(card.id));
    };
    exampleContent.topics.forEach((topic: Topic) => visit(topic));
    links.forEach((id) => expect(ids.has(id)).toBe(true));
    expect(exampleManifest.cover).toMatch(/^assets\//);
  });

  it("illustrates retained deleted progress and a share without progress", () => {
    expect(exampleProgress.lessons.deleted.timeSpentSeconds).toBeGreaterThan(0);
    expect(JSON.stringify(exampleContent)).not.toContain('"id":"deleted"');
    expect(sharedSubject).not.toHaveProperty("progress");
    expect(emptySubject.content.topics).toEqual([]);
    expect(emptySubject).not.toHaveProperty("progress");
  });
});
