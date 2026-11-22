import { createRoot, createSignal, flush } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExerciseSet } from "../../../../../../core/learning-program";
import { emptySubjectProgress } from "../../../../../../core/subject-review";
import { createSessionController } from "./createSessionController";

const set: ExerciseSet = {
  id: "set",
  type: "exercise-set",
  title: "Practice",
  exercises: [
    {
      id: "choice",
      type: "multiple-choice",
      prompt: "Question",
      choices: [
        { id: "a", html: "A" },
        { id: "b", html: "B" },
      ],
      correctChoiceId: "a",
    },
    { id: "written", type: "written-answer", prompt: "Question", referenceAnswer: "Answer" },
  ],
};
const now = Date.parse("2026-11-20T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

function mount(exerciseSet = set) {
  return createRoot((dispose) => {
    const [progress, updateProgress] = createSignal(emptySubjectProgress("UTC"));
    const session = createSessionController({ progress, updateProgress }, exerciseSet);
    return { dispose, progress, session };
  });
}

it("records graded answers, notes, completion and elapsed time", () => {
  const { dispose, progress, session } = mount();
  try {
    session.start();
    flush();
    session.setResponse("b");
    flush();
    session.submitChoice();
    expect(session.index()).toBe(0);
    vi.advanceTimersByTime(2200);
    session.reveal();
    session.setNote("Review this");
    flush();
    session.submitChoice();
    flush();
    expect(session.index()).toBe(1);
    expect(session.response()).toBe("");
    expect(session.revealed()).toBe(false);
    session.setResponse("My answer");
    session.reveal();
    flush();
    vi.advanceTimersByTime(1800);
    session.record(true);
    flush();
    const result = progress().exerciseSets.set;
    expect(result.timeSpentSeconds).toBe(4);
    expect(result.attempts[0]).toMatchObject({
      startedAt: now,
      finishedAt: now + 4000,
      answers: [
        {
          exerciseId: "choice",
          response: "b",
          correct: false,
          note: "Review this",
          answeredAt: now + 2200,
        },
        { exerciseId: "written", response: "My answer", correct: true, answeredAt: now + 4000 },
      ],
    });
    expect(session.finished()).toBe(true);
    session.end();
    flush();
    expect(session.attemptId()).toBeUndefined();
  } finally {
    dispose();
  }
});

it("grades correct choices and retains incomplete attempts on end and cleanup", () => {
  const { dispose, progress, session } = mount();
  session.start();
  flush();
  session.setResponse("a");
  session.reveal();
  flush();
  session.submitChoice();
  flush();
  expect(progress().exerciseSets.set.attempts[0].answers[0].correct).toBe(true);
  vi.advanceTimersByTime(3000);
  session.end();
  flush();
  expect(progress().exerciseSets.set.timeSpentSeconds).toBe(3);
  expect(progress().exerciseSets.set.attempts[0].finishedAt).toBeUndefined();
  session.start();
  flush();
  vi.advanceTimersByTime(2000);
  dispose();
  flush();
  expect(progress().exerciseSets.set.timeSpentSeconds).toBe(5);
  expect(progress().exerciseSets.set.attempts).toHaveLength(2);
});

it("does not start an empty set", () => {
  const { dispose, progress, session } = mount({ ...set, exercises: [] });
  try {
    session.start();
    expect(session.attemptId()).toBeUndefined();
    expect(progress().exerciseSets).toEqual({});
  } finally {
    dispose();
  }
});
