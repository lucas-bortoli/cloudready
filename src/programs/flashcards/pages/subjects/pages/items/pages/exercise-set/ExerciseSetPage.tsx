import type { ExerciseSet } from "../../../../../../core/learning-program";

/** Props for an exercise set page. */
export interface ExerciseSetPageProps {
  /** Exercise set to display. */
  exerciseSet: ExerciseSet;
}

export default function ExerciseSetPage(props: ExerciseSetPageProps) {
  return (
    <div class="h-full w-full p-4">
      <h1 class="text-2xl">{props.exerciseSet.title}</h1>
      {props.exerciseSet.exercises.length} questions
    </div>
  );
}
