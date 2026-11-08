import { For, Show } from "solid-js";
import type { DeckSummary } from "../ui/createReviewController";

/**

 * Deck summaries and selection action for the package overview.

 */
export interface DeckListProps {
  decks: readonly DeckSummary[];
  unsupported: number;
  onSelect(id: string): void;
}

/**

 * Displays supported decks and explains import and session limitations.

 */
export default function DeckList(props: DeckListProps) {
  return (
    <>
      <p>
        Review history in imported packages starts fresh in CloudReady. Reopening the same package
        restores CloudReady progress. Avoid reviewing in separate browser sessions at the same time.
      </p>
      <Show when={props.unsupported > 0}>
        <p role="status">
          {props.unsupported} cards use unsupported templates and cannot be studied.
        </p>
      </Show>
      <For each={props.decks}>
        {(deck) => (
          <button
            class="rounded border bg-white p-4 text-left outline-sky-300 focus:outline-2 focus:outline-offset-2"
            onClick={props.onSelect.bind(null, deck.id)}
          >
            {deck.name} <span class="text-neutral-500">({deck.cardCount} cards)</span>
          </button>
        )}
      </For>
    </>
  );
}
