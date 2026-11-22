import { createSignal, flush, Show } from "solid-js";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import Folder16 from "@carbon/icons/es/folder/16.js";
import { SidebarItem } from "../sidebar/SidebarItem";
import AppFrame from "./AppFrame";

it("renders sidebar slot items within the sidebar context", async () => {
  const original = globalThis.ResizeObserver;
  const frameObservers: ResizeObserverCallback[] = [];
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    public constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    public observe(target: Element) {
      if (target.matches("main")) frameObservers.push(this.callback);
    }
    public unobserve() {}
    public disconnect() {}
  } as typeof ResizeObserver;
  const root = document.createElement("div");
  document.body.append(root);
  const [hasToolbar, setHasToolbar] = createSignal(false);
  const [toolbarClass, setToolbarClass] = createSignal("test-toolbar");
  const [navigationKey, setNavigationKey] = createSignal("folder");
  try {
    const { artifact } = await captureArtifact(
      () => {
        const dispose = render(
          () => (
            <AppFrame class={toolbarClass()}>
              <AppFrame.Sidebar
                class={toolbarClass()}
                navigationKey={navigationKey()}
                selectedItem="folder"
                setSelectedItem={vi.fn()}
              >
                <SidebarItem icon={Folder16} itemKey="folder" label="Folder" />
              </AppFrame.Sidebar>
              <AppFrame.SidebarHeader class={toolbarClass()}>Folders</AppFrame.SidebarHeader>
              <Show when={hasToolbar()}>
                <AppFrame.Header class={toolbarClass()}>Toolbar</AppFrame.Header>
              </Show>
              <AppFrame.Status class={toolbarClass()}>Ready</AppFrame.Status>
              <AppFrame.SidebarStatus class={toolbarClass()}>One folder</AppFrame.SidebarStatus>
              <AppFrame.Main class={toolbarClass()}>
                <article>Page</article>
              </AppFrame.Main>
            </AppFrame>
          ),
          root,
        );
        expect(root.querySelector("aside button")?.getAttribute("data-selected")).toBe("true");
        expect(root.querySelector("aside header")?.textContent).toBe("Folders");
        expect(root.querySelector("aside footer")?.textContent).toBe("One folder");
        expect(root.querySelector("main > section > header")?.textContent).toBe("");
        setHasToolbar(true);
        flush();
        expect(root.querySelector("main > section > header")?.textContent).toBe("Toolbar");
        const header = root.querySelector("main > section > header");
        expect(header?.classList.contains("test-toolbar")).toBe(true);
        setToolbarClass("test-toolbar-updated");
        flush();
        expect(root.querySelector("main")?.classList.contains("test-toolbar-updated")).toBe(true);
        expect(root.querySelector("main > div")?.classList.contains("test-toolbar-updated")).toBe(
          true,
        );
        expect(root.querySelector("aside header")?.classList.contains("test-toolbar-updated")).toBe(
          true,
        );
        expect(root.querySelector("aside footer")?.classList.contains("test-toolbar-updated")).toBe(
          true,
        );
        expect(
          root.querySelector("main > section > footer")?.classList.contains("test-toolbar-updated"),
        ).toBe(true);
        expect(
          root.querySelector("article")?.parentElement?.classList.contains("test-toolbar-updated"),
        ).toBe(true);
        expect(header?.classList.contains("test-toolbar-updated")).toBe(true);
        expect(header?.classList.contains("border-neutral-200")).toBe(true);
        expect(root.querySelector("main > section > footer")?.textContent).toBe("Ready");
        expect(root.querySelector("article")?.textContent).toBe("Page");
        for (const resize of frameObservers.slice()) {
          resize([{ contentRect: { width: 400 } } as ResizeObserverEntry], {} as ResizeObserver);
        }
        flush();
        expect(root.querySelector('[role="dialog"] aside button')?.textContent).toBe("Folder");
        expect(root.querySelector('[role="dialog"] aside footer')?.textContent).toBe("One folder");
        expect(
          root.querySelector('[role="dialog"] aside')?.classList.contains("test-toolbar-updated"),
        ).toBe(true);
        const menuButton = root.querySelector<HTMLButtonElement>('[aria-label="Open sidebar"]')!;
        expect(menuButton.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
        const drawer = root.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(drawer.classList.contains("motion-safe:transition-[transform,visibility]")).toBe(
          true,
        );
        menuButton.click();
        flush();
        expect((root.querySelector('[role="dialog"]') as HTMLElement).style.visibility).toBe(
          "visible",
        );
        setNavigationKey("other");
        flush();
        expect(drawer.hasAttribute("inert")).toBe(true);
        expect((root.querySelector('[role="dialog"]') as HTMLElement).style.visibility).toBe(
          "hidden",
        );
        dispose();
      },
      { scenario: "app-frame-navigation" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    root.remove();
    globalThis.ResizeObserver = original;
  }
});

it("rejects a direct child that is not an AppFrame slot", () => {
  const root = document.createElement("div");
  expect(() =>
    render(
      () => (
        <AppFrame>
          <article>Page</article>
        </AppFrame>
      ),
      root,
    ),
  ).toThrow("AppFrame children must be AppFrame slots");
});

it("shows the secondary sidebar docked or as a dismissible narrow drawer", async () => {
  const [secondaryClass, setSecondaryClass] = createSignal("queue-header");
  const original = globalThis.ResizeObserver;
  const resizeFrames: ResizeObserverCallback[] = [];
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    public constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    public observe(target: Element) {
      if (target.matches("main")) resizeFrames.push(this.callback);
    }
    public unobserve() {}
    public disconnect() {}
  } as typeof ResizeObserver;
  const root = document.createElement("div");
  document.body.append(root);
  try {
    const { artifact } = await captureArtifact(() => {
      const dispose = render(
        () => (
          <AppFrame>
            <AppFrame.Sidebar selectedItem={null} setSelectedItem={vi.fn()}>
              Navigation
            </AppFrame.Sidebar>
            <AppFrame.Main>Page</AppFrame.Main>
            <AppFrame.SecondarySidebar label="Queue" class={secondaryClass()}>
              <button>Queue item</button>
            </AppFrame.SecondarySidebar>
            <AppFrame.SecondarySidebarHeader class={secondaryClass()}>
              Queue tools
            </AppFrame.SecondarySidebarHeader>
            <AppFrame.SecondarySidebarStatus class="queue-status">
              One track
            </AppFrame.SecondarySidebarStatus>
          </AppFrame>
        ),
        root,
      );
      expect(root.querySelector('aside[aria-label="Queue"] header')?.textContent).toBe(
        "Queue tools",
      );
      expect(root.querySelector('aside[aria-label="Queue"] footer')?.textContent).toBe("One track");
      expect(
        root.querySelector('aside[aria-label="Queue"] header')?.classList.contains("queue-header"),
      ).toBe(true);
      setSecondaryClass("queue-header-updated");
      flush();
      expect(
        root.querySelector('aside[aria-label="Queue"]')?.classList.contains("queue-header-updated"),
      ).toBe(true);
      expect(
        root
          .querySelector('aside[aria-label="Queue"] header')
          ?.classList.contains("queue-header-updated"),
      ).toBe(true);
      expect(
        root.querySelector('aside[aria-label="Queue"] footer')?.classList.contains("queue-status"),
      ).toBe(true);
      expect(root.querySelector('aside[aria-label="Queue"] button')?.textContent).toBe(
        "Queue item",
      );
      expect(root.querySelector("main > section > header")).not.toBeNull();
      expect(root.querySelector("main > section > footer")).not.toBeNull();
      for (const resizeFrame of resizeFrames.slice()) {
        resizeFrame([{ contentRect: { width: 400 } } as ResizeObserverEntry], {} as ResizeObserver);
      }
      flush();
      const button = root.querySelector<HTMLButtonElement>('button[aria-label="Queue"]')!;
      const drawer = root.querySelector<HTMLElement>('[role="dialog"][aria-label="Queue"]')!;
      const mainPane = root.querySelector<HTMLElement>("main > section")!;
      const primaryDrawer = root.querySelector<HTMLElement>(
        '[role="dialog"][aria-label="Sidebar"]',
      )!;
      const primaryButton = root.querySelector<HTMLButtonElement>(
        'button[aria-label="Open sidebar"]',
      )!;
      expect(mainPane.hasAttribute("inert")).toBe(false);
      expect(primaryDrawer.hasAttribute("inert")).toBe(true);
      primaryButton.click();
      flush();
      expect(mainPane.hasAttribute("inert")).toBe(true);
      expect(primaryDrawer.hasAttribute("inert")).toBe(false);
      expect(drawer.hasAttribute("inert")).toBe(true);
      primaryDrawer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      flush();
      expect(mainPane.hasAttribute("inert")).toBe(false);
      expect(document.activeElement).toBe(primaryButton);
      expect(drawer.classList.contains("motion-safe:transition-[transform,visibility]")).toBe(true);
      expect(drawer.style.transform).toBe("translateX(100%)");
      expect(drawer.classList.contains("queue-header-updated")).toBe(true);
      expect(drawer.querySelector("header")?.textContent).toBe("Queue tools");
      expect(drawer.querySelector("footer")?.textContent).toBe("One track");
      expect(drawer.querySelector("header")?.classList.contains("queue-header-updated")).toBe(true);
      expect(drawer.querySelector("footer")?.classList.contains("queue-status")).toBe(true);
      expect(drawer.hasAttribute("inert")).toBe(true);
      const scheduleFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
      const firstButton = drawer.querySelector<HTMLButtonElement>("button")!;
      const focusButton = vi.spyOn(firstButton, "focus");
      button.click();
      flush();
      scheduleFrame.mock.calls[0][0](0);
      expect(focusButton).not.toHaveBeenCalled();
      scheduleFrame.mock.calls[1][0](16);
      expect(focusButton).toHaveBeenCalledWith({ preventScroll: true });
      expect(document.activeElement).toBe(firstButton);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(mainPane.hasAttribute("inert")).toBe(true);
      expect(primaryDrawer.hasAttribute("inert")).toBe(true);
      expect(drawer.style.transform).toBe("translateX(0%)");
      expect(drawer.hasAttribute("inert")).toBe(false);
      drawer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      flush();
      expect(drawer.hasAttribute("inert")).toBe(true);
      expect(mainPane.hasAttribute("inert")).toBe(false);
      expect(drawer.style.transform).toBe("translateX(100%)");
      expect(drawer.style.visibility).toBe("hidden");
      expect(document.activeElement).toBe(button);
      scheduleFrame.mockRestore();
      dispose();
    });
    expectNoDiagnostics(artifact);
  } finally {
    root.remove();
    globalThis.ResizeObserver = original;
  }
});
