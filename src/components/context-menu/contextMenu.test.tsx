import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import { WindowManagerProvider, useWindowManager } from "../window-manager/WindowManagerContext";
import type WindowManager from "../window-manager/WindowManager";
import WindowsOutlet from "../window-manager/WindowsOutlet";
import { ContextMenuProvider } from "./ContextMenuContext";
import { contextMenu } from "./contextMenu";

void contextMenu;

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function setup(managed = true) {
  const select = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  let manager: WindowManager | undefined;
  function Content() {
    return (
      <ContextMenuProvider>
        <button
          data-menu-target
          use:contextMenu={[
            { label: "Open", onSelect: select },
            { type: "separator" },
            { type: "label", label: "More actions" },
            { label: "Disabled", onSelect: select, disabled: true },
            { label: "Delete", onSelect: select },
          ]}
        >
          Target <span>Child</span>
        </button>
      </ContextMenuProvider>
    );
  }
  function ManagedWindows() {
    manager = useWindowManager();
    onMount(() => {
      manager!.createWindow({ content: Content });
      manager!.createWindow({ content: () => <button data-other-target>Other window</button> });
    });
    return <WindowsOutlet />;
  }
  const dispose = render(
    () => (
      <LayerProvider>
        {managed ? (
          <WindowManagerProvider>
            <ManagedWindows />
          </WindowManagerProvider>
        ) : (
          <Content />
        )}
      </LayerProvider>
    ),
    container,
  );
  cleanups.push(() => {
    dispose();
    container.remove();
  });
  const target = container.querySelector<HTMLButtonElement>("[data-menu-target]")!;
  const frame = target.closest<HTMLElement>('[x-role="window"]');
  return { target, select, dispose, manager, frame, container };
}

function open(target: HTMLElement) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 20,
  });
  target.dispatchEvent(event);
  return event;
}

describe("contextMenu", () => {
  it("ignores requests originating on a descendant", () => {
    const { target } = setup();
    const event = open(target.querySelector("span")!);
    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("opens actions and invokes the selected action", async () => {
    const { target, select, manager, frame } = setup();
    expect(open(target).defaultPrevented).toBe(true);
    await Promise.resolve();
    const items = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(document.querySelector('[role="separator"]')).not.toBeNull();
    expect(document.querySelector('[role="presentation"]')?.textContent).toBe("More actions");
    expect(items).toHaveLength(3);
    expect(document.activeElement).toBe(items[0]);
    expect(frame?.getAttribute("data-active")).toBe("true");
    expect(manager!.activeWindowId()).toBe(manager!.getWindows()[0].id);
    items[0].click();
    expect(select).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(frame?.getAttribute("data-active")).toBe("true");
    expect(document.activeElement).toBe(target);
  });

  it("navigates enabled actions and restores focus on Escape", async () => {
    const { target, frame } = setup();
    open(target);
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("Delete");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(target);
    expect(frame?.getAttribute("data-active")).toBe("true");
  });

  it("wraps Tab and Shift+Tab through enabled actions", async () => {
    const { target, frame } = setup();
    open(target);
    await Promise.resolve();
    const tab = (shiftKey = false) => {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    expect(frame?.getAttribute("data-active")).toBe("true");
    tab(true);
    expect(document.activeElement?.textContent).toBe("Delete");
    tab();
    expect(document.activeElement?.textContent).toBe("Open");
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(frame?.getAttribute("data-active")).toBe("true");
  });

  it("keeps standalone menus usable without a window manager", async () => {
    const { target, select } = setup(false);
    open(target);
    await Promise.resolve();
    const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    expect(document.activeElement).toBe(item);
    item.click();
    expect(select).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(target);
  });

  it("transfers activation to another window after outside dismissal", async () => {
    const { target, frame, container, manager } = setup();
    open(target);
    await Promise.resolve();
    const other = container.querySelector<HTMLButtonElement>("[data-other-target]")!;
    other.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    other.focus();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(frame?.hasAttribute("data-active")).toBe(false);
    expect(manager!.activeWindowId()).toBe(manager!.getWindows()[1].id);
  });

  it("closes when its owning window is destroyed", async () => {
    const { target, manager } = setup();
    open(target);
    await Promise.resolve();
    const id = manager!.getWindows()[0].id;
    manager!.destroyWindow(id);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(manager!.activeWindowId()).toBeNull();
    manager!.finishDestroyWindow(id);
  });

  it("closes on an outside press and cleans up on disposal", async () => {
    const { target, dispose, manager } = setup();
    open(target);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    open(target);
    await Promise.resolve();
    dispose();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(manager!.activeWindowId()).toBeNull();
  });
});
