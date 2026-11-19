import { Show } from "solid-js";
import { useCurrentSubject } from "../../../../../../components/subjects/useCurrentSubject";
import { LessonView } from "./components/LessonView";
import type { Lesson } from "../../../../../../core/learning-program";

/** Props for a lesson page. */
export interface LessonPageProps {
  /** Lesson to display. */
  lesson: Lesson;
  /** Selects a subject item by its ID. */
  onSelect: (id: string) => void;
}

export default function LessonPage(props: LessonPageProps) {
  const subject = useCurrentSubject();

  return (
    <Show when={subject()}>
      {(subject) => (
        <LessonView subject={subject()} html={props.lesson.html} onSelect={props.onSelect} />
      )}
    </Show>
  );
}
