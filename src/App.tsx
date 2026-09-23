import { onCleanup, onMount } from "solid-js";
import Button from "./components/button/Button";
import Taskbar from "./components/taskbar/TaskBar";
import type { WindowId } from "./components/window-manager/WindowManager";
import { useWindowManager } from "./components/window-manager/WindowManagerContext";
import WindowsOutlet from "./components/window-manager/WindowsOutlet";

/** Root desktop application, including its initial demonstration window. */
export default function App() {
  const windowManager = useWindowManager();

  let windowId: WindowId | undefined;

  onMount(() => {
    windowId = windowManager.createWindow({
      content: () => (
        <section class="p-4">
          <h1 class="mb-3 text-xl font-semibold text-neutral-900">Hi!</h1>
          <div class="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => undefined}>
              Primary
            </Button>
            <Button variant="secondary" onClick={() => undefined}>
              Secondary
            </Button>
            <Button variant="ghost" onClick={() => undefined}>
              Ghost
            </Button>
            <Button variant="danger" onClick={() => undefined}>
              Danger
            </Button>
          </div>
        </section>
      ),
    });
  });

  onCleanup(() => {
    if (windowId) {
      windowManager.removeWindow(windowId);
      windowId = undefined;
    }
  });

  return (
    <div x-role="desktop root" class="relative h-full w-full text-base">
      <h1>Hello World! {windowManager.getWindows().length} window(s)</h1>
      <WindowsOutlet />
      <Taskbar />
    </div>
  );
}
