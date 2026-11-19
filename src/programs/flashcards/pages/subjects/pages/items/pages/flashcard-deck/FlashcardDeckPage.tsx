import { createMemo, Show } from "solid-js";
import { SubjectDeckReview } from "../../../../../../components/review/SubjectDeckReview";
import { useCurrentSubjectEntry } from "../../../../../../components/subjects/useCurrentSubject";
import type { FlashcardDeck } from "../../../../../../core/learning-program";

/** The routed deck and navigation callback for links in its cards. */
export interface FlashcardDeckPageProps {
  deck: FlashcardDeck;
  onSelect: (id: string) => void;
}

/** Opens a new review session when the routed subject or deck changes. */
export default function FlashcardDeckPage(props: FlashcardDeckPageProps) {
  const subject = useCurrentSubjectEntry();
  const route = createMemo(() => {
    const entry = subject();
    if (entry) return { entry, deck: props.deck };
  });

  return (
    <Show when={route()} keyed>
      {(current) => (
        <SubjectDeckReview
          entry={current.entry}
          title={current.deck.title}
          decks={[current.deck]}
          onSelect={props.onSelect}
        />
      )}
    </Show>
  );
}
