import { createEffect, createMemo, onCleanup } from "solid-js";
import { cardDocument } from "../browser/card-document";
import type { RenderedCard } from "../core/template";

/**

 * Card side and package media used to build an isolated iframe document.

 */
export interface CardFrameProps {
  card: RenderedCard | undefined;
  revealed: boolean;
  media: Record<string, Uint8Array>;
}

/**

 * Renders an untrusted card in a sandbox and releases its image URLs on replacement.

 */
export default function CardFrame(props: CardFrameProps) {
  const document = createMemo(() => {
    if (!props.card) {
      return undefined;
    }
    const html = props.revealed ? props.card.back : props.card.front;
    return cardDocument(html, props.card.css, props.media);
  });
  createEffect(() => {
    const current = document();
    // Each document owns its URLs until it is replaced or the frame is removed.
    onCleanup(() => {
      current?.urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    });
  });
  return (
    <iframe
      title="Flashcard"
      sandbox=""
      class="min-h-48 w-full flex-1 rounded border bg-white"
      srcdoc={document()?.srcdoc}
    />
  );
}
