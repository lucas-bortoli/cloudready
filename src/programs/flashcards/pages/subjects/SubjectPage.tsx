import { Show } from "solid-js";
import { SubjectContents } from "../../components/subjects/SubjectContents";
import { useCurrentSubject } from "../../components/subjects/useCurrentSubject";

/** Displays the subject root and its package metadata. */
export default function SubjectPage(props: { onSelect: (id: string) => void }) {
  const subject = useCurrentSubject();

  return (
    <Show when={subject()} fallback={<p>This subject is unavailable.</p>}>
      {(subject) => (
        <SubjectContents
          title={subject().manifest.title}
          items={subject().content.topics}
          emptyMessage="This subject has no topics yet."
          onSelect={props.onSelect}
        >
          <p>{subject().manifest.description}</p>
          <p>{subject().manifest.language}</p>
          <h2 class="mt-6 mb-3 text-xl font-semibold">Topics</h2>
        </SubjectContents>
      )}
    </Show>
  );
}
