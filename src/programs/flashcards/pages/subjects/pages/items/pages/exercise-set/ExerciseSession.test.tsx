import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { expect, it, vi } from "vitest";
import { emptySubjectProgress } from "../../../../../../core/subject-review";
import type { OpenSubjectEntry } from "../../../../../../ui/createSubjectController";
import ExerciseSession from "./ExerciseSession";

vi.mock("../../../../../../components/subjects/SubjectHtmlView", () => ({
  SubjectHtmlView: (props: { html: string }) => <div>{props.html}</div>,
}));

it("shows history, reveals an answer and displays the completed score", () => {
  const initial = emptySubjectProgress("UTC");
  initial.exerciseSets.set = {
    timeSpentSeconds: 0,
    attempts: [{ id: "old", startedAt: 1, answers: [] }],
  };
  const [progress, updateProgress] = createSignal(initial);
  const entry = { progress, updateProgress, subject: {} } as unknown as OpenSubjectEntry;
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(
    () => (
      <ExerciseSession
        entry={entry}
        exerciseSet={{
          id: "set",
          type: "exercise-set",
          title: "Set",
          exercises: [
            {
              id: "question",
              type: "written-answer",
              prompt: "Prompt",
              referenceAnswer: "Reference",
            },
          ],
        }}
        onSelect={() => {}}
      />
    ),
    root,
  );
  const click = (label: string) => {
    const button = [...root.querySelectorAll("button")].find((element) =>
      element.textContent?.includes(label),
    );
    expect(button).toBeDefined();
    button!.click();
  };
  try {
    expect(root.textContent).toContain("Previous attempts");
    expect(root.textContent).toContain("Incomplete");
    click("Start attempt");
    expect(root.textContent).toContain("Prompt");
    click("Check answer");
    expect(root.textContent).toContain("Reference");
    click("Correct");
    expect(root.textContent).toContain("1 of 1 correct");
    click("Back to exercise set");
    expect(root.textContent).toContain("Previous attempts");
  } finally {
    dispose();
    root.remove();
  }
});

it("disables starting an empty set", () => {
  const [progress, updateProgress] = createSignal(emptySubjectProgress("UTC"));
  const entry = { progress, updateProgress, subject: {} } as unknown as OpenSubjectEntry;
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(
    () => (
      <ExerciseSession
        entry={entry}
        exerciseSet={{ id: "empty", type: "exercise-set", title: "Empty", exercises: [] }}
        onSelect={() => {}}
      />
    ),
    root,
  );
  try {
    expect(root.querySelector("button")?.getAttribute("aria-disabled")).toBe("true");
  } finally {
    dispose();
    root.remove();
  }
});
