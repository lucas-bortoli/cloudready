import { createEffect } from "solid-js";

export interface ScopedHtmlProps {
  title: string;
  /** Prepared markup and CSS. The renderer moves the body's children into its shadow root. */
  content: { body: HTMLElement; css: string } | undefined;
  baseCss?: string;
  bodyClass?: string;
  onClick?: (event: MouseEvent, root: ShadowRoot) => void;
}

/**
 * Displays prepared HTML with styles scoped to its own shadow tree.
 * Callers must sanitize any untrusted markup and CSS before passing them in.
 */
export function ScopedHtml(props: ScopedHtmlProps) {
  const host = (<div role="group" aria-label={props.title} />) as HTMLDivElement;
  const root = host.attachShadow({ mode: "open" });
  const base = document.createElement("style");
  const styles = document.createElement("style");
  const body = document.createElement("div");
  root.append(base, styles, body);

  const handleClick = (event: Event) => {
    if (event instanceof MouseEvent) props.onClick?.(event, root);
  };
  root.addEventListener("click", handleClick);

  createEffect(() => {
    body.className = `content-body ${props.bodyClass ?? ""}`.trimEnd();
    base.textContent = `
      :host { display: block; min-width: 0; contain: paint; }
      .content-body { display: flow-root; overflow-wrap: anywhere; }
      img, video { max-width: 100%; }
      ${props.baseCss ?? ""}
    `;
  });

  createEffect(() => {
    const content = props.content;
    styles.textContent = content?.css ?? "";
    const children = document.createDocumentFragment();
    while (content?.body.firstChild) children.append(content.body.firstChild);
    body.replaceChildren(children);
  });
  return host;
}
