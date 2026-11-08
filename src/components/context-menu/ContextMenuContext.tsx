import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
  useContext,
  untrack,
  type ParentProps,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useLayerItem } from "../layer-manager/LayerContext";
import { useOptionalCurrentWindowId } from "../window-manager/CurrentWindowContext";
import { useOptionalWindowManager } from "../window-manager/WindowManagerContext";
import type { WindowOverlayRegistration } from "../window-manager/WindowManager";
import ContextMenuAction from "./menu-items/ContextMenuAction";
import ContextMenuLabel from "./menu-items/ContextMenuLabel";
import ContextMenuSeparator from "./menu-items/ContextMenuSeparator";

export interface ContextMenuAction {
  type?: "action";
  label: string;
  icon?: CarbonIconDescriptor;
  onSelect: () => void;
  disabled?: boolean;
}

export type ContextMenuItem =
  ContextMenuAction | { type: "separator" } | { type: "label"; label: string };

interface OpenMenu {
  items: readonly ContextMenuItem[];
  x: number;
  y: number;
  target: HTMLElement;
}

interface ContextMenuContextValue {
  open: (menu: OpenMenu) => void;
  close: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue>();

/** Thrown when a context menu directive is used without its provider. */
export class ContextMenuContextError extends Error {
  public constructor() {
    super("ContextMenuProvider is missing.");
    this.name = "ContextMenuContextError";
  }
}

/** Provides a shared context menu for descendant targets.
 *
 * @throws {LayerContextError} When called outside a LayerProvider.
 */
export function ContextMenuProvider(props: ParentProps) {
  const [menu, setMenu] = createSignal<OpenMenu | null>(null);
  const hasIcons = createMemo(
    () =>
      menu()?.items.some(
        (item) => (item.type === undefined || item.type === "action") && !!item.icon,
      ) ?? false,
  );
  const layer = useLayerItem("shell");
  let menuElement: HTMLDivElement | undefined;
  const windowId = useOptionalCurrentWindowId();
  const windowManager = useOptionalWindowManager();
  let ownership: WindowOverlayRegistration | undefined;

  createEffect(() => {
    if (!menu() || !windowId || !windowManager) return;
    const owner = windowManager.getWindows().find((entry) => entry.id === windowId);
    if (!owner || owner.isClosing || owner.isMinimized) close();
  });

  function close() {
    setMenu(null);
    ownership?.dispose();
    ownership = undefined;
  }

  function open(next: OpenMenu) {
    if (!next.items.length) return;
    close();
    layer.bringToTop();
    setMenu(next);
    // Read the latest owner once after rendering; focusing is an imperative opening step.
    queueMicrotask(() =>
      untrack(() => {
        if (menu() !== next || !menuElement) return;
        if (windowId && windowManager) {
          const owner = windowManager.getWindows().find((entry) => entry.id === windowId);
          if (
            !owner ||
            owner.isClosing ||
            owner.isMinimized ||
            windowManager.isMinimizing(windowId)
          ) {
            close();
            return;
          }
          ownership = windowManager.registerOwnedOverlay(windowId, menuElement);
        }
        const bounds = menuElement.getBoundingClientRect();
        menuElement.style.left = `${Math.max(0, Math.min(next.x, window.innerWidth - bounds.width))}px`;
        menuElement.style.top = `${Math.max(0, Math.min(next.y, window.innerHeight - bounds.height))}px`;
        const firstAction = menuElement.querySelector<HTMLButtonElement>("button:not(:disabled)");
        (firstAction ?? menuElement).focus();
      }),
    );
  }

  function handleOutsidePointer(event: PointerEvent) {
    if (menu() && !menuElement?.contains(event.target as Node)) close();
  }

  function handleKeyDown(event: KeyboardEvent) {
    const current = menu();
    if (!current || !menuElement?.contains(document.activeElement)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (current.target.isConnected) current.target.focus();
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(
      menuElement?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      nextIndex = (index + 1) % buttons.length;
    } else nextIndex = index <= 0 ? buttons.length - 1 : index - 1;
    buttons[nextIndex].focus();
  }

  function handleSelect(item: ContextMenuAction) {
    const target = menu()?.target;
    if (target?.isConnected) target.focus();
    close();
    item.onSelect();
  }

  function handleScroll() {
    close();
  }

  document.addEventListener("pointerdown", handleOutsidePointer, true);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", close);
  document.addEventListener("scroll", handleScroll, true);
  onCleanup(() => {
    close();
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
    document.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", close);
    document.removeEventListener("scroll", handleScroll, true);
  });

  return (
    <ContextMenuContext.Provider value={{ open, close }}>
      {props.children}
      <Show when={menu()}>
        {(current) => (
          <Portal>
            <div
              ref={menuElement}
              role="menu"
              tabIndex={-1}
              class="fixed min-w-40 border border-neutral-300 bg-white p-1 text-sm text-neutral-800 shadow-lg"
              style={{
                left: `${current().x}px`,
                top: `${current().y}px`,
                "z-index": layer.zIndex(),
              }}
            >
              <For each={current().items}>
                {(item) => (
                  <Switch>
                    <Match when={item.type === "separator"}>
                      <ContextMenuSeparator />
                    </Match>
                    <Match when={item.type === "label" && item}>
                      {(label) => <ContextMenuLabel label={label().label} />}
                    </Match>
                    <Match when={(item.type === undefined || item.type === "action") && item}>
                      {(action) => (
                        <ContextMenuAction
                          label={action().label}
                          icon={action().icon}
                          disabled={action().disabled}
                          showIconColumn={hasIcons()}
                          onSelect={handleSelect.bind(null, action())}
                        />
                      )}
                    </Match>
                  </Switch>
                )}
              </For>
            </div>
          </Portal>
        )}
      </Show>
    </ContextMenuContext.Provider>
  );
}

/**
 * Returns the nearest context menu controller.
 *
 * @throws {ContextMenuContextError} When called outside a ContextMenuProvider.
 */
export function useContextMenu(): ContextMenuContextValue {
  const context = useContext(ContextMenuContext);
  if (!context) throw new ContextMenuContextError();
  return context;
}
