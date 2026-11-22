import { createContext, untrack, useContext, type ParentProps } from "solid-js";
import type { WindowId } from "./WindowManager";

const CurrentWindowIdContext = createContext<WindowId | null>(null);

/** Thrown when window content reads its ID outside a current-window provider. */
export class CurrentWindowContextMissingError extends Error {
  public constructor() {
    super("CurrentWindowProvider is missing.");
    this.name = "CurrentWindowContextMissingError";
  }
}

/** Provides the immutable ID of the window rendering a content subtree. */
export function CurrentWindowProvider(props: ParentProps<{ windowId: WindowId }>) {
  const windowId = untrack(() => props.windowId);

  return <CurrentWindowIdContext value={windowId}>{props.children}</CurrentWindowIdContext>;
}

/**
 * Returns the ID of the window rendering the current content subtree.
 *
 * @throws {CurrentWindowContextMissingError} When called outside a {@link CurrentWindowProvider}.
 */
export function useCurrentWindowId(): WindowId {
  const id = useOptionalCurrentWindowId();

  if (!id) {
    throw new CurrentWindowContextMissingError();
  }

  return id;
}

/**
 * Returns the current content window's ID, or undefined outside a window.
 */
export function useOptionalCurrentWindowId(): WindowId | undefined {
  return useContext(CurrentWindowIdContext) ?? undefined;
}
