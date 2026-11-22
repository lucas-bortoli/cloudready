import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it } from "vitest";
import { LayerProvider } from "../layer-manager/LayerContext";
import type WindowManager from "../window-manager/WindowManager";
import type { WindowId } from "../window-manager/WindowManager";
import { ContextMenuProvider, useContextMenu } from "./ContextMenuContext";

it("closes an open menu when its owner is minimized", async () => {
  const { artifact } = await captureArtifact(
    async () => {
      const [minimized, setMinimized] = createSignal(false);
      const id = "window-1" as WindowId;
      const manager = {
        getWindows: () => [{ id, isClosing: false, isMinimized: minimized() }],
        isMinimizing: () => false,
        registerOwnedOverlay: () => ({ dispose() {} }),
      } as unknown as WindowManager;
      const container = document.createElement("div");
      document.body.append(container);

      function Target() {
        const menu = useContextMenu();
        function handleClick(event: MouseEvent) {
          menu.open({
            items: [{ label: "Open", onSelect() {} }],
            target: event.currentTarget as HTMLElement,
            x: 0,
            y: 0,
            owner: { windowId: id, windowManager: manager },
          });
        }
        return <button onClick={handleClick}>Target</button>;
      }

      const dispose = render(
        () => (
          <LayerProvider>
            <ContextMenuProvider>
              <Target />
            </ContextMenuProvider>
          </LayerProvider>
        ),
        container,
      );
      try {
        container.querySelector("button")!.click();
        flush();
        await Promise.resolve();
        expect(document.querySelector('[role="menu"]')).not.toBeNull();
        setMinimized(true);
        flush();
        expect(document.querySelector('[role="menu"]')).toBeNull();
      } finally {
        dispose();
        container.remove();
      }
    },
    { scenario: "context-menu-owner-minimized" },
  );
  expectNoDiagnostics(artifact);
});
