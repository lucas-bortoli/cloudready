import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { cn } from "../../../../lib/dom";
import styles from "./flashcard.module.css";

/** A proportionally scaled card surface. */
export interface FlashcardProps {
  children: (showBack: Accessor<boolean>) => JSX.Element;
  class?: string;
  /** Which side should be shown; changing it animates the flip. */
  showBack: boolean;
  /** Plays the exit animation before the card is removed. */
  leaving?: boolean;
}

/** Displays content on a 5:7 card that scales as a single surface. */
export default function Flashcard(props: FlashcardProps) {
  let observer: ResizeObserver | undefined;
  let midpoint: number | undefined;
  let end: number | undefined;
  const [visibleBack, setVisibleBack] = createSignal(false);
  const [flipping, setFlipping] = createSignal(false);
  let initialSide = true;

  createEffect(
    () => props.showBack,
    (showBack) => {
      if (initialSide) {
        initialSide = false;
        setVisibleBack(showBack);
        return;
      }
      window.clearTimeout(midpoint);
      window.clearTimeout(end);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setVisibleBack(showBack);
        setFlipping(false);
        return;
      }
      setFlipping(true);
      midpoint = window.setTimeout(() => setVisibleBack(showBack), 150);
      end = window.setTimeout(() => setFlipping(false), 300);
    },
  );

  const observeSize = (element: HTMLDivElement) => {
    observer = new ResizeObserver(([entry]) => {
      element.style.setProperty("--card-scale", String(entry.contentRect.width / 320));
    });
    observer.observe(element);
  };

  onCleanup(() => {
    observer?.disconnect();
    window.clearTimeout(midpoint);
    window.clearTimeout(end);
  });

  return (
    <div
      ref={observeSize}
      class={cn(
        styles.surface,
        "shrink-0 overflow-hidden rounded-sm",
        styles.enter,
        flipping() && styles.flip,
        props.leaving && styles.leave,
        props.class,
      )}
    >
      <div class={cn(styles.content, "flex flex-col p-5")}>{props.children(visibleBack)}</div>
    </div>
  );
}
