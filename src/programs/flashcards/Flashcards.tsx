import { createSignal, Show, untrack } from "solid-js";
import Button from "../../components/button/Button";
import DeckList from "./components/DeckList";
import PackageFilePicker from "./components/PackageFilePicker";
import PackageToolbar from "./components/PackageToolbar";
import ReviewView from "./components/ReviewView";
import { createPackageController } from "./ui/createPackageController";
import { createReviewController } from "./ui/createReviewController";

/**

 * Identifies the profile whose progress is used by this window.

 */
export interface FlashcardsProps {
  userId: string;
}

/**

 * Composes package selection and review for the active profile.

 */
export default function Flashcards(props: FlashcardsProps) {
  // A window belongs to one profile for its entire lifetime.
  const userId = untrack(() => {
    return props.userId;
  });
  const packages = createPackageController(userId);
  const review = createReviewController(packages.loaded);
  const [browsing, setBrowsing] = createSignal(false);

  const handleDeviceFile = (file: File): void => {
    void packages.openDevice(file);
  };
  const handleBrowse = (): void => {
    setBrowsing(true);
  };
  const handleCloseBrowser = (): void => {
    setBrowsing(false);
  };
  const handleFile = (path: string, name: string): void => {
    setBrowsing(false);
    void packages.openFile(path, name);
  };

  return (
    <div
      x-role="flashcards"
      class="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-neutral-50 p-4 text-neutral-800"
    >
      <PackageToolbar
        busy={packages.busy()}
        error={packages.error()}
        onDeviceFile={handleDeviceFile}
        onBrowse={handleBrowse}
        onCancel={packages.cancel}
      />
      <Show when={browsing()}>
        <PackageFilePicker onSelect={handleFile} onClose={handleCloseBrowser} />
      </Show>
      <Show
        when={packages.loaded()}
        fallback={
          <p>
            Open an Anki package to start studying. Your review progress is saved to your CloudReady
            profile.
          </p>
        }
      >
        <Show when={review.saveError()}>
          <div role="alert" class="rounded bg-red-100 p-2">
            Could not save progress. <Button onClick={review.retrySave}>Retry</Button>
          </div>
        </Show>
        <Show
          when={!review.deckId()}
          fallback={
            <ReviewView
              deckName={review.deckName()}
              summary={review.summary()}
              dailyLimit={review.dailyLimit()}
              card={review.currentCard()}
              rendered={review.rendered()}
              media={packages.loaded()!.collection.media}
              revealed={review.revealed()}
              saving={review.saving()}
              saveError={Boolean(review.saveError())}
              canUndo={review.canUndo()}
              intervalLabel={review.intervalLabel}
              onBack={review.closeDeck}
              onLimit={review.setLimit}
              onReveal={review.reveal}
              onReplay={review.replay}
              onRate={review.rate}
              onUndo={review.undo}
            />
          }
        >
          <DeckList
            decks={review.decks()}
            unsupported={review.unsupported()}
            onSelect={review.selectDeck}
          />
        </Show>
      </Show>
    </div>
  );
}
