import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { expect, it, vi } from "vitest";
import { emptySubjectProgress } from "../../../../../../core/subject-review";
import type { OpenSubjectEntry } from "../../../../../../ui/createSubjectController";
import Session from "./Session";

const dialogMock = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("../../../../../../../../components/dialog/Dialog", () => ({
  default: () => dialogMock.show,
  RejectReasonDialogCancelled: "reject-reason:DialogCancelled",
}));

vi.mock("../../../../../../components/user-html/UserHtml", () => ({
  UserHtml: (props: { html: string }) => <div>{props.html}</div>,
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
      <Session
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
      <Session
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

it("moves focus between choices with Tab without changing the answer", () => {
  const [progress, updateProgress] = createSignal(emptySubjectProgress("UTC"));
  const entry = { progress, updateProgress, subject: {} } as unknown as OpenSubjectEntry;
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(
    () => (
      <Session
        entry={entry}
        exerciseSet={{
          id: "set",
          type: "exercise-set",
          title: "Set",
          exercises: [
            {
              id: "question",
              type: "multiple-choice",
              prompt: "Prompt",
              choices: [
                { id: "a", html: "A" },
                { id: "b", html: "B" },
              ],
              correctChoiceId: "a",
            },
          ],
        }}
        onSelect={() => {}}
      />
    ),
    root,
  );
  try {
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Start attempt"))!
      .click();
    const choices = root.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    choices[0].focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    choices[0].dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(choices[1]);
    expect(choices[0].checked).toBe(false);
    expect(choices[1].checked).toBe(false);
    const back = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    choices[1].dispatchEvent(back);
    expect(document.activeElement).toBe(choices[0]);
  } finally {
    dispose();
    root.remove();
  }
});

it("ends an attempt only after confirmation", async () => {
  const [progress, updateProgress] = createSignal(emptySubjectProgress("UTC"));
  const entry = { progress, updateProgress, subject: {} } as unknown as OpenSubjectEntry;
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(
    () => (
      <Session
        entry={entry}
        exerciseSet={{
          id: "set",
          type: "exercise-set",
          title: "Set",
          exercises: [
            { id: "question", type: "written-answer", prompt: "Prompt", referenceAnswer: "Answer" },
          ],
        }}
        onSelect={() => {}}
      />
    ),
    root,
  );
  const click = (label: string) => {
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes(label))!
      .click();
  };
  try {
    click("Start attempt");
    dialogMock.show.mockReturnValueOnce({
      exists: () => true,
      emphasize: vi.fn(),
      result: Promise.resolve("cancel"),
    });
    click("End attempt");
    await Promise.resolve();
    expect(root.textContent).toContain("Prompt");
    dialogMock.show.mockReturnValueOnce({
      exists: () => true,
      emphasize: vi.fn(),
      result: Promise.resolve("end"),
    });
    click("End attempt");
    await Promise.resolve();
    expect(root.textContent).toContain("Previous attempts");
    expect(root.textContent).toContain("Incomplete");
  } finally {
    dispose();
    root.remove();
  }
});
