import { createEffect, createMemo } from "solid-js";
import { cardDocument } from "../../browser/card-document";
import type { RenderedCard } from "../../core/template";
import { ScopedHtml } from "../../../../components/scoped-html/ScopedHtml";

/**
 * Card side and package media used to render a card.
 */
export interface CardContentProps {
  card: RenderedCard | undefined;
  revealed: boolean;
  media: Record<string, Uint8Array>;
}

/**
 * Renders a sanitized card and releases its image URLs on replacement.
 */
export default function CardContent(props: CardContentProps) {
  const document = createMemo(() => {
    if (!props.card) {
      return undefined;
    }
    const html = props.revealed ? props.card.back : props.card.front;
    return cardDocument(html, props.card.css, props.media);
  });
  createEffect(
    () => document(),
    (current) => () => {
      current?.urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    },
  );
  return (
    <div class="min-h-48 w-full flex-auto shrink-0 rounded border bg-white">
      <ScopedHtml title="Flashcard" content={document()} bodyClass="card" />
    </div>
  );
}
