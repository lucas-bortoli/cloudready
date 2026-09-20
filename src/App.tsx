import { onCleanup, onMount } from "solid-js";
import type { WindowId } from "./components/window-manager/WindowManager";
import { useWindowManager } from "./components/window-manager/WindowManagerContext";
import WindowsOutlet from "./components/window-manager/WindowsOutlet";

/** Root desktop application, including its initial demonstration window. */
export default function App() {
  const windowManager = useWindowManager();

  let windowId: WindowId | undefined;

  onMount(() => {
    windowId = windowManager.createWindow({
      content: () => <h1>Hi!</h1>,
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
    </div>
  );
}
