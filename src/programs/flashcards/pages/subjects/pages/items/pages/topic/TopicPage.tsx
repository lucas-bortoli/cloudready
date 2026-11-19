import { SubjectContents } from "../../../../../../components/subjects/SubjectContents";
import type { Topic } from "../../../../../../core/learning-program";

/** Props for a topic page. */
export interface TopicPageProps {
  /** Topic to display. */
  topic: Topic;
  /** Selects a subject item by its ID. */
  onSelect: (id: string) => void;
}

export default function TopicPage(props: TopicPageProps) {
  return (
    <SubjectContents
      title={props.topic.title}
      items={props.topic.items}
      emptyMessage="This topic has no items yet."
      onSelect={props.onSelect}
    />
  );
}
