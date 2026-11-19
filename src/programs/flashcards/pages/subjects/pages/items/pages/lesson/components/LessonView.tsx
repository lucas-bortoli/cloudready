import {
  SubjectHtmlView,
  type SubjectHtmlViewProps,
} from "../../../../../../../components/subjects/SubjectHtmlView";

/** The open subject, lesson HTML, and internal navigation callback. */
export type LessonViewProps = Omit<SubjectHtmlViewProps, "title">;

/** Displays a lesson using the shared LAP content renderer. */
export function LessonView(props: LessonViewProps) {
  return (
    <SubjectHtmlView
      subject={props.subject}
      html={props.html}
      onSelect={props.onSelect}
      title="Lesson"
    />
  );
}
