import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  newCard,
  nextMemory,
  retrievability,
  schedule,
  SchedulerInputError,
  type Rating,
} from "./fsrs";

// Values are from ts-fsrs 5.2.3, commit 0d72a487, with default weights and fuzz disabled.
const vectors = [
  [
    0,
    [
      [8.34176237, 3.05124894],
      [6.66599536, 5.2490704],
      [4.99022837, 10],
      [3.31446137, 15.53430795],
    ],
  ],
  [
    1,
    [
      [8.34176237, 1.2086474],
      [6.66599536, 11.8325715],
      [4.99022837, 13.04717575],
      [3.31446137, 15.70705546],
    ],
  ],
  [
    30,
    [
      [8.34176237, 1.6162163],
      [6.66599536, 36.19554855],
      [4.99022837, 53.55761316],
      [3.31446137, 91.57905369],
    ],
  ],
] as const;

describe("FSRS-6 memory", () => {
  it("matches the pinned reference for every rating and short/long intervals", () => {
    for (const [elapsed, results] of vectors)
      for (let i = 0; i < 4; i++) {
        const actual = nextMemory({ difficulty: 5, stability: 10 }, elapsed, (i + 1) as Rating);
        expect(actual.difficulty).toBeCloseTo(results[i][0], 7);
        expect(actual.stability).toBeCloseTo(results[i][1], 7);
      }
  });
  it("rejects invalid state and does not mutate inputs", () => {
    const state = { difficulty: 5, stability: 10 };
    nextMemory(state, 1, 3);
    expect(state).toEqual({ difficulty: 5, stability: 10 });
    expect(() => nextMemory(state, -1, 3)).toThrow(SchedulerInputError);
    expect(() => retrievability(0, 0)).toThrow(SchedulerInputError);
  });
  it("matches a complete reference review sequence", () => {
    let card = newCard();
    const sequence = [
      [0, 1, "learning", 60000, 0.212, 6.4133],
      [60000, 3, "review", 86460000, 0.24668919, 6.40211507],
      [86460000, 3, "review", 259260000, 2.02147724, 6.39094132],
      [172860000, 1, "relearning", 173460000, 0.4923406, 8.79895532],
      [173460000, 3, "review", 259860000, 0.54200304, 8.78538473],
    ] as const;
    for (const [now, rating, phase, due, stability, difficulty] of sequence) {
      card = schedule(card, rating, now).card;
      expect(card.phase).toBe(phase);
      expect(card.due).toBe(due);
      expect(card.stability).toBeCloseTo(stability, 7);
      expect(card.difficulty).toBeCloseTo(difficulty, 7);
    }
  });
  it("bounds intervals and rejects invalid model parameters", () => {
    const parameters = { ...DEFAULT_PARAMETERS, maximumInterval: 2 };
    const original = {
      ...newCard(),
      phase: "review" as const,
      lastReview: 0,
      due: 1,
      stability: 100,
      difficulty: 5,
      repetitions: 1,
    };
    const result = schedule(original, 4, 86400000, parameters);
    expect(result.card.scheduledDays).toBe(2);
    expect(original.scheduledDays).toBe(0);
    expect(() => schedule(original, 3, 86400000, { ...parameters, desiredRetention: 1 })).toThrow(
      SchedulerInputError,
    );
    expect(() =>
      schedule(original, 3, 86400000, {
        ...parameters,
        weights: DEFAULT_PARAMETERS.weights.map(() => -1),
      }),
    ).toThrow(SchedulerInputError);
  });
  it("starts, learns, graduates and records a lapse", () => {
    const first = schedule(newCard(), 1, 0).card;
    expect([first.phase, first.due]).toEqual(["learning", 60000]);
    const graduated = schedule(first, 3, 60000).card;
    expect(graduated.phase).toBe("review");
    const failed = schedule(graduated, 1, graduated.due).card;
    expect([failed.phase, failed.lapses, failed.due]).toEqual([
      "relearning",
      1,
      graduated.due + 600000,
    ]);
  });
});
