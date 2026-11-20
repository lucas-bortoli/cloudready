import { createMemo, Show } from "solid-js";
import { useCurrentSubjectEntry } from "../../../../../../components/subjects/useCurrentSubject";
import type { ExerciseSet } from "../../../../../../core/learning-program";
import ExerciseSession from "./ExerciseSession";

/** The set and navigation callback for links in its content. */
export interface ExerciseSetPageProps {
  exerciseSet: ExerciseSet;
  onSelect: (id: string) => void;
}

/** Opens a fresh session when the subject or set changes. */
export default function ExerciseSetPage(props: ExerciseSetPageProps) {
  const entry = useCurrentSubjectEntry();
  const route = createMemo(() => {
    const current = entry();
    if (current) return { entry: current, exerciseSet: props.exerciseSet };
  });
  return (
    <Show when={route()} keyed>
      {(current) => (
        <ExerciseSession
          entry={current.entry}
          exerciseSet={current.exerciseSet}
          onSelect={props.onSelect}
        />
      )}
    </Show>
  );
}
