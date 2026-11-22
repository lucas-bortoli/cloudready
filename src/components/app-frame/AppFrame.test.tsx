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
            <AppFrame>
              <AppFrame.Sidebar
                navigationKey={navigationKey()}
                selectedItem="folder"
                setSelectedItem={vi.fn()}
              >
                <SidebarItem icon={Folder16} itemKey="folder" label="Folder" />
              </AppFrame.Sidebar>
              <AppFrame.SidebarHeader>Folders</AppFrame.SidebarHeader>
              <Show when={hasToolbar()}>
                <AppFrame.Header class={toolbarClass()}>Toolbar</AppFrame.Header>
              </Show>
              <AppFrame.Status>Ready</AppFrame.Status>
              <AppFrame.SidebarStatus>One folder</AppFrame.SidebarStatus>
              <AppFrame.Main>
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
