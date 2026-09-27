import { onCleanup } from "solid-js";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      focusTrap: typeof focusTrap;
    }
  }
}

/**
 * Keeps keyboard tab navigation within an element's focusable descendants.
 *
 * Attach with `use:focusTrap={focusTrap}`. The directive wraps focus from the
 * last descendant to the first, and vice versa for Shift+Tab, then removes its
 * listener when Solid disposes the element.
 */
export default function focusTrap(element: HTMLElement): void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;

    const focusable = Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (candidate) => candidate.getClientRects().length > 0,
    );

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1)!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  element.addEventListener("keydown", onKeyDown);
  onCleanup(() => element.removeEventListener("keydown", onKeyDown));
}
