import { createSignal, onCleanup } from "solid-js";
import generateUuid from "../../../../../../../../lib/uuid";
import type {
  ExerciseAnswer,
  ExerciseAttempt,
  ExerciseSet,
} from "../../../../../../core/learning-program";
import type { OpenSubjectEntry } from "../../../../../../ui/createSubjectController";

/** Manages an attempt against the open subject's progress draft. */
export function createExerciseSessionController(
  entry: Pick<OpenSubjectEntry, "progress" | "updateProgress">,
  exerciseSet: ExerciseSet,
) {
  const [attemptId, setAttemptId] = createSignal<string>();
  const [index, setIndex] = createSignal(0);
  const [response, setResponse] = createSignal("");
  const [note, setNote] = createSignal("");
  const [revealed, setRevealed] = createSignal(false);
  const [finished, setFinished] = createSignal(false);
  let lastTime = 0;

  const exercise = () => exerciseSet.exercises[index()];
  const history = () => entry.progress().exerciseSets[exerciseSet.id]?.attempts ?? [];
  const currentAttempt = () => history().find((attempt) => attempt.id === attemptId());

  // Apply changes to the latest shared draft so another window’s edits are retained.
  const updateAttempt = (change: (attempt: ExerciseAttempt) => ExerciseAttempt) => {
    const progress = entry.progress();
    const old = progress.exerciseSets[exerciseSet.id];
    if (!old) return;
    // Carry fractional seconds forward between updates.
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - lastTime) / 1000));
    lastTime += elapsed * 1000;

    entry.updateProgress({
      ...progress,
      exerciseSets: {
        ...progress.exerciseSets,
        [exerciseSet.id]: {
          ...old,
          timeSpentSeconds: old.timeSpentSeconds + elapsed,
          attempts: old.attempts.map((attempt) => {
            if (attempt.id === attemptId()) return change(attempt);
            return attempt;
          }),
        },
      },
    });
  };

  const start = () => {
    if (!exerciseSet.exercises.length) return;

    const now = Date.now();
    const id = generateUuid();
    const progress = entry.progress();
    const old = progress.exerciseSets[exerciseSet.id];
    lastTime = now;
    entry.updateProgress({
      ...progress,
      exerciseSets: {
        ...progress.exerciseSets,
        [exerciseSet.id]: {
          timeSpentSeconds: old?.timeSpentSeconds ?? 0,
          attempts: [...(old?.attempts ?? []), { id, startedAt: now, answers: [] }],
        },
      },
    });

    setIndex(0);
    setResponse("");
    setNote("");
    setRevealed(false);
    setFinished(false);
    setAttemptId(id);
  };

  const reveal = () => setRevealed(true);

  const record = (correct: boolean) => {
    const current = exercise();
    if (!current || !revealed()) return;

    const answer: ExerciseAnswer = {
      exerciseId: current.id,
      response: response(),
      correct,
      answeredAt: Date.now(),
    };
    if (note().trim()) answer.note = note();

    const isLast = index() === exerciseSet.exercises.length - 1;
    updateAttempt((attempt) => {
      const next = { ...attempt, answers: [...attempt.answers, answer] };
      if (isLast) next.finishedAt = Date.now();
      return next;
    });

    // Advance only after the answer has been recorded in the draft.
    if (isLast) {
      setFinished(true);
    } else {
      setIndex(index() + 1);
      setResponse("");
      setNote("");
      setRevealed(false);
    }
  };

  const submitChoice = () => {
    const current = exercise();
    if (current?.type === "multiple-choice") record(response() === current.correctChoiceId);
  };

  const end = () => {
    if (attemptId() && !finished()) updateAttempt((attempt) => attempt);
    setAttemptId(undefined);
    setFinished(false);
  };

  // Leaving the page keeps the attempt incomplete but records its elapsed time.
  onCleanup(() => {
    if (attemptId() && !finished()) updateAttempt((attempt) => attempt);
  });

  return {
    attemptId,
    index,
    response,
    setResponse,
    note,
    setNote,
    revealed,
    finished,
    exercise,
    history,
    currentAttempt,
    start,
    reveal,
    record,
    submitChoice,
    end,
  };
}
