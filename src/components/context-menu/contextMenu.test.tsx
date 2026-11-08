import { createSignal, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import Button from "../button/Button";
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
            <ContextMenuProvider>
              <ManagedWindows />
            </ContextMenuProvider>
          </WindowManagerProvider>
        ) : (
          <ContextMenuProvider>
            <Content />
          </ContextMenuProvider>
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
  it("shares one provider across windows and desktop while tracking each target's owner", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    let manager: WindowManager | undefined;
    const [showFirst, setShowFirst] = createSignal(true);
    const select = vi.fn();

    function FirstWindow() {
      return (
        <Show when={showFirst()}>
          <button data-first use:contextMenu={[{ label: "First", onSelect: select }]}>
            First
          </button>
        </Show>
      );
    }
    function SecondWindow() {
      return (
        <button data-second use:contextMenu={[{ label: "Second", onSelect: select }]}>
          Second
        </button>
      );
    }
    function Desktop() {
      manager = useWindowManager();
      onMount(() => {
        manager!.createWindow({ content: FirstWindow });
        manager!.createWindow({ content: SecondWindow });
      });
      return (
        <>
          <button data-desktop use:contextMenu={[{ label: "Desktop", onSelect: select }]}>
            Desktop
          </button>
          <WindowsOutlet />
        </>
      );
    }
    const dispose = render(
      () => (
        <LayerProvider>
          <WindowManagerProvider>
            <ContextMenuProvider>
              <Desktop />
            </ContextMenuProvider>
          </WindowManagerProvider>
        </LayerProvider>
      ),
      container,
    );
    cleanups.push(() => {
      dispose();
      container.remove();
    });
    const first = container.querySelector<HTMLButtonElement>("[data-first]")!;
    const second = container.querySelector<HTMLButtonElement>("[data-second]")!;
    const desktop = container.querySelector<HTMLButtonElement>("[data-desktop]")!;
    open(first);
    await Promise.resolve();
    expect(manager!.activeWindowId()).toBe(manager!.getWindows()[0].id);
    open(second);
    await Promise.resolve();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Second");
    expect(manager!.activeWindowId()).toBe(manager!.getWindows()[1].id);
    setShowFirst(false);
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Second");
    open(desktop);
    await Promise.resolve();
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Desktop");
    expect(manager!.activeWindowId()).toBeNull();
  });

  it("closes a shared menu when its target unmounts, including before the opening microtask", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const [visible, setVisible] = createSignal(true);
    const select = vi.fn();
    const dispose = render(
      () => (
        <LayerProvider>
          <ContextMenuProvider>
            <Show when={visible()}>
              <button use:contextMenu={[{ label: "Open", onSelect: select }]}>Target</button>
            </Show>
          </ContextMenuProvider>
        </LayerProvider>
      ),
      container,
    );
    cleanups.push(() => {
      dispose();
      container.remove();
    });
    open(container.querySelector("button")!);
    setVisible(false);
    await Promise.resolve();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    setVisible(true);
    open(container.querySelector("button")!);
    await Promise.resolve();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    setVisible(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("forwards use:contextMenu on Button with reactive items and a separate ref", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const [items, setItems] = createSignal([{ label: "First", onSelect: first }]);
    const container = document.createElement("div");
    document.body.append(container);
    let target: HTMLButtonElement | undefined;
    function captureButton(element: HTMLButtonElement) {
      target = element;
    }
    const dispose = render(
      () => (
        <LayerProvider>
          <ContextMenuProvider>
            <Button ref={captureButton} use:contextMenu={items()}>
              Actions
            </Button>
          </ContextMenuProvider>
        </LayerProvider>
      ),
      container,
    );
    cleanups.push(() => {
      dispose();
      container.remove();
    });
    expect(target).toBe(container.querySelector("button"));
    expect(target!.hasAttribute("use:contextmenu")).toBe(false);
    open(target!);
    await Promise.resolve();
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("First");
    document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(first).toHaveBeenCalledOnce();
    setItems([{ label: "Second", onSelect: second }]);
    open(target!);
    await Promise.resolve();
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Second");
    document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(second).toHaveBeenCalledOnce();
    dispose();
    expect(open(target!).defaultPrevented).toBe(false);
  });

  it("attaches to a Button through its forwarded ref and cleans up on disposal", async () => {
    const select = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    let target: HTMLButtonElement | undefined;

    function attachMenu(element: HTMLButtonElement) {
      target = element;
      contextMenu(element, () => [{ label: "Open", onSelect: select }]);
    }

    const dispose = render(
      () => (
        <LayerProvider>
          <ContextMenuProvider>
            <Button ref={attachMenu} startIcon={<span>Icon</span>}>
              Label
            </Button>
          </ContextMenuProvider>
        </LayerProvider>
      ),
      container,
    );
    cleanups.push(() => {
      dispose();
      container.remove();
    });
    expect(target).toBe(container.querySelector("button"));
    expect(open(target!).defaultPrevented).toBe(true);
    await Promise.resolve();
    document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(select).toHaveBeenCalledOnce();
    dispose();
    expect(open(target!).defaultPrevented).toBe(false);
  });

  it("ignores requests originating on a descendant", () => {
    const { target } = setup();
    const event = open(target.querySelector("span")!);
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("suppresses the browser menu outside targets without stopping propagation, and cleans up", () => {
    const { container, dispose } = setup();
    const onContextMenu = vi.fn();
    document.addEventListener("contextmenu", onContextMenu);
    const event = open(container);
    expect(event.defaultPrevented).toBe(true);
    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    dispose();
    const afterDispose = open(document.body);
    expect(afterDispose.defaultPrevented).toBe(false);
    document.removeEventListener("contextmenu", onContextMenu);
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
