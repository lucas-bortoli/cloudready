import { onCleanup, type Accessor } from "solid-js";
import { useOptionalCurrentWindowId } from "../window-manager/CurrentWindowContext";
import { useOptionalWindowManager } from "../window-manager/WindowManagerContext";
import { useContextMenu, type ContextMenuItem } from "./ContextMenuContext";

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      contextMenu: readonly ContextMenuItem[];
    }
    interface DirectiveFunctions {
      contextMenu: typeof contextMenu;
    }
  }
}

/**
 * Opens the supplied actions when the element itself receives a context-menu request.
 *
 * @throws {ContextMenuContextError} When called outside a ContextMenuProvider.
 */
export function contextMenu(
  element: HTMLElement,
  items: Accessor<readonly ContextMenuItem[]>,
): void {
  const context = useContextMenu();
  const windowId = useOptionalCurrentWindowId();
  const windowManager = useOptionalWindowManager();

  function handleContextMenu(event: MouseEvent) {
    if (event.target !== element) return;
    const actions = items() ?? [];
    if (!actions.length || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    // Keyboard context-menu requests may not carry pointer coordinates.
    const bounds = element.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    context.open({
      items: actions,
      x: keyboard ? bounds.left : event.clientX,
      y: keyboard ? bounds.bottom : event.clientY,
      target: element,
      owner: windowId && windowManager ? { windowId, windowManager } : undefined,
    });
  }

  element.addEventListener("contextmenu", handleContextMenu);
  onCleanup(() => {
    element.removeEventListener("contextmenu", handleContextMenu);
    context.closeFor(element);
  });
}
