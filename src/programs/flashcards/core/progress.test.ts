import { describe, expect, it } from "vitest";
import type { AnkiCard } from "./anki";
import {
  emptyProgress,
  parseProgress,
  ProgressFormatError,
  rateCard,
  reviewQueue,
  studyDate,
} from "./progress";

const cards: AnkiCard[] = [
  { id: "2", noteId: "2", deckId: "d", ordinal: 0, position: 20 },
  { id: "1", noteId: "1", deckId: "d", ordinal: 0, position: 10 },
];
describe("review progress", () => {
  it("limits introductions by the stored study day and orders due before new", () => {
    let p = emptyProgress("hash", "deck", "America/Sao_Paulo");
    p.dailyLimit.d = 1;
    expect(reviewQueue(cards, p, "d", 0).map((c) => c.id)).toEqual(["1"]);
    p = rateCard(p, cards[1], 1, 0, "review-1").progress;
    expect(reviewQueue(cards, p, "d", 30000)).toEqual([]);
    expect(reviewQueue(cards, p, "d", 60000).map((c) => c.id)).toEqual(["1"]);
    expect(studyDate(Date.UTC(2025, 0, 1, 2), p.timezone)).toBe("2024-12-31");
    expect(reviewQueue(cards, p, "d", Date.UTC(2025, 0, 1, 4)).map((c) => c.id)).toEqual([
      "1",
      "2",
    ]);
  });
  it("rejects malformed, incompatible, and wrong-package records", () => {
    const p = emptyProgress("hash", "deck", "UTC");
    expect(parseProgress(JSON.stringify(p), "hash")).toEqual(p);
    expect(() => parseProgress("{", "hash")).toThrow(ProgressFormatError);
    expect(() => parseProgress(JSON.stringify({ ...p, version: 2 }), "hash")).toThrow(
      ProgressFormatError,
    );
    expect(() => parseProgress(JSON.stringify(p), "other")).toThrow(ProgressFormatError);
  });
});
