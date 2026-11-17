import { createEffect, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import Button from "../../components/button/Button";
import Sidebar from "../../components/sidebar/Sidebar";
import type { WindowId } from "../../components/window-manager/WindowManager";
import { useWindowManager } from "../../components/window-manager/WindowManagerContext";
import useFilePicker from "../file-manager/file-picker/FilePicker";
import DeckList from "./components/DeckList";
import ReviewView from "./components/review/ReviewView";
import { createPackageController } from "./ui/createPackageController";
import { createReviewController } from "./ui/createReviewController";

import ChartLine16 from "@carbon/icons/es/chart--line/16.js";
import Cognitive16 from "@carbon/icons/es/cognitive/16.js";
import EarthFilled16 from "@carbon/icons/es/earth--filled/16.js";
import Education16 from "@carbon/icons/es/education/16.js";
import TaskApproved16 from "@carbon/icons/es/task--approved/16.js";
import { SidebarItem } from "../../components/sidebar/SidebarItem";
import { SidebarSection } from "../../components/sidebar/SidebarSection";

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
  const userId = untrack(() => props.userId);
  const packages = createPackageController(userId);
  const review = createReviewController(packages.loaded);
  const windowManager = useWindowManager();
  const [selectedItem, setSelectedItem] = createSignal<string | null>("spanish-1-theory");
  let reviewWindow: WindowId | undefined;
  let deactivateReview: (() => void) | undefined;

  const closeReview = (): void => {
    const id = reviewWindow;
    reviewWindow = undefined;
    deactivateReview?.();
    deactivateReview = undefined;
    review.closeDeck();
    if (id) {
      windowManager.destroyWindow(id);
    }
  };

  // The review window depends on this window's package and controllers.
  onCleanup(closeReview);
  createEffect(
    on(
      packages.loaded,
      () => {
        if (reviewWindow) {
          closeReview();
        }
      },
      { defer: true },
    ),
  );

  const handleSelectDeck = (id: string): void => {
    review.selectDeck(id);
    if (reviewWindow) {
      windowManager.setMinimized(reviewWindow, false);
      windowManager.bringToTop(reviewWindow);
      return;
    }
    const [active, setActive] = createSignal(true);
    deactivateReview = () => {
      setActive(false);
    };
    reviewWindow = windowManager.createWindow({
      title: "Flashcards review",
      size: { width: 800, height: 600 },
      minimumSize: { width: 320, height: 360 },
      closer: () => {
        reviewWindow = undefined;
        deactivateReview?.();
        deactivateReview = undefined;
        review.closeDeck();
        return true;
      },
      content: () => (
        <div class="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-neutral-50 p-4 text-neutral-800">
          <Show when={review.saveError()}>
            <div role="alert" class="rounded bg-red-100 p-2">
              Could not save progress. <Button onClick={review.retrySave}>Retry</Button>
            </div>
          </Show>
          <Show when={active() && packages.loaded() && review.deckId()}>
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
              onLimit={review.setLimit}
              onReveal={review.reveal}
              onReplay={review.replay}
              onRate={review.rate}
              onUndo={review.undo}
            />
          </Show>
        </div>
      ),
    });
  };

  const handleBrowse = async () => {
    filePicker
      .show()
      .then(([picked]) => packages.openFile(picked.path, picked.name))
      .catch(() => {});
  };

  const filePicker = useFilePicker({
    type: "file",
    suffixes: [".apkg"],
    multiple: true,
  });

  return (
    <div x-role="flashcards" class="flex h-full text-neutral-800">
      <Sidebar selectedItem={selectedItem()} setSelectedItem={setSelectedItem}>
        <SidebarSection label="Idiomas">
          <SidebarItem itemKey="spanish" label="Español" icon={EarthFilled16}>
            <SidebarItem itemKey="spanish-theory" label="Teoria" icon={Education16} />
            <SidebarItem itemKey="spanish-exercises" label="Exercícios" icon={TaskApproved16} />
            <SidebarItem itemKey="spanish-memorization" label="Memorização" icon={Cognitive16} />
            <SidebarItem itemKey="spanish-progress" label="Meu Progresso" icon={ChartLine16} />
          </SidebarItem>
          <SidebarItem itemKey="english" label="Español" icon={EarthFilled16}>
            <SidebarItem itemKey="english-theory" label="Teoria" icon={Education16} />
            <SidebarItem itemKey="english-exercises" label="Exercícios" icon={TaskApproved16} />
            <SidebarItem itemKey="english-memorization" label="Memorização" icon={Cognitive16} />
            <SidebarItem itemKey="english-progress" label="Meu Progresso" icon={ChartLine16} />
          </SidebarItem>
        </SidebarSection>
      </Sidebar>
      <main class="flex h-full grow flex-col overflow-auto bg-neutral-50 p-4">
        <Button onClick={handleBrowse}>Open Deck File</Button>
        <Show
          when={packages.loaded()}
          fallback={
            <p>
              Open an Anki package to start studying. Your review progress is saved to your
              CloudReady profile.
            </p>
          }
        >
          <Show when={review.saveError()}>
            <div role="alert" class="rounded bg-red-100 p-2">
              Could not save progress. <Button onClick={review.retrySave}>Retry</Button>
            </div>
          </Show>
          <DeckList
            decks={review.decks()}
            unsupported={review.unsupported()}
            onSelect={handleSelectDeck}
          />
        </Show>
      </main>
    </div>
  );
}
