import { onCleanup } from "solid-js";
import { useCurrentWindowId } from "./CurrentWindowContext";
import type { WindowCloser } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

/**
 * Registers a closer for the window rendering the current component subtree.
 *
 * @param closer Returns whether the current window should be destroyed.
 * @throws {CurrentWindowContextMissingError} When called outside a {@link CurrentWindowProvider}.
 */
export default function useWindowCloser(closer: WindowCloser) {
  const windowId = useCurrentWindowId();
  const windowManager = useWindowManager();

  windowManager.setCloser(windowId, closer);
  onCleanup(() => windowManager.setCloser(windowId));
}
