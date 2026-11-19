import type { FlashcardDeck } from "../../../../../../core/learning-program";

/** Props for a flashcard deck page. */
export interface FlashcardDeckPageProps {
  /** Flashcard deck to display. */
  deck: FlashcardDeck;
}

export default function FlashcardDeckPage(props: FlashcardDeckPageProps) {
  return (
    <div class="h-full w-full p-4">
      <h1 class="text-2xl">{props.deck.title}</h1>
      {props.deck.cards.length} cards
    </div>
  );
}
