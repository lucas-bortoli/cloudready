import { onCleanup, type Accessor } from "solid-js";
import { useOptionalCurrentWindowId } from "../window-manager/CurrentWindowContext";
import { useOptionalWindowManager } from "../window-manager/WindowManagerContext";
import { useContextMenu, type ContextMenuItem } from "./ContextMenuContext";

/** Creates a ref that attaches a context menu and cleans it up with its owner.
 *
 * @throws {ContextMenuContextError} When called outside a ContextMenuProvider.
 */
export function createContextMenuRef(items: Accessor<readonly ContextMenuItem[]>) {
  const context = useContextMenu();
  const windowId = useOptionalCurrentWindowId();
  const windowManager = useOptionalWindowManager();
  let element: HTMLElement | undefined;

  function handleContextMenu(event: MouseEvent) {
    if (!element || event.target !== element) return;
    const actions = items() ?? [];
    if (!actions.length || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
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

  onCleanup(() => {
    if (element) {
      element.removeEventListener("contextmenu", handleContextMenu);
      context.closeFor(element);
    }
  });
  return (target: HTMLElement) => {
    element = target;
    element.addEventListener("contextmenu", handleContextMenu);
  };
}
