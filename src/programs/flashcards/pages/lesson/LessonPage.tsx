import { Show } from "solid-js";
import { useNavigation } from "../../components/navigation/NavigationContext";
import { LessonView } from "../../components/subject/LessonView";
import { useSubjects } from "../../components/subjects/SubjectsContext";
import type { Lesson } from "../../core/learning-program";

/** Props for a lesson page. */
export interface LessonPageProps {
  /** Lesson to display. */
  lesson: Lesson;
  /** Selects a subject item by its ID. */
  onSelect: (id: string) => void;
}

export default function LessonPage(props: LessonPageProps) {
  const subjects = useSubjects();
  const navigation = useNavigation();
  const subject = () => {
    const route = navigation.route();
    if (route.page === "subject" || route.page === "item") {
      return subjects.subjects().find((entry) => entry.path === route.subjectPath)?.subject;
    } else {
      return undefined;
    }
  };

  return (
    <Show when={subject()}>
      {(subject) => (
        <LessonView subject={subject()} html={props.lesson.html} onSelect={props.onSelect} />
      )}
    </Show>
  );
}
