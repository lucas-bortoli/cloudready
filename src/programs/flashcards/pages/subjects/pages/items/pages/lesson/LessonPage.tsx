import { Show } from "solid-js";
import { useCurrentSubject } from "../../../../../../components/subjects/useCurrentSubject";
import { UserHtml } from "../../../../../../components/user-html/UserHtml";
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
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <UserHtml title="Lesson" html={props.lesson.html} onSelect={props.onSelect} />
      </div>
    </Show>
  );
}
