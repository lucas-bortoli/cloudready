import { onCleanup, onMount } from "solid-js";
import Taskbar from "./components/taskbar/TaskBar";
import type { WindowId } from "./components/window-manager/WindowManager";
import { useWindowManager } from "./components/window-manager/WindowManagerContext";
import WindowsOutlet from "./components/window-manager/WindowsOutlet";
import FileManager from "./programs/file-manager/FileManager";
import Kodekai from "./programs/kodekai/Kodekai";

/** Root desktop application, including its initial Files window. */
export default function App() {
  const windowManager = useWindowManager();
  let windowId: WindowId | undefined;
  let kodekaiWindowId: WindowId | undefined;

  const openFiles = () => {
    windowId = windowManager.createWindow({
      title: "Files",
      size: { width: 760, height: 500 },
      minimumSize: { width: 520, height: 320 },
      content: () => <FileManager />,
    });
  };

  const openKodekai = () => {
    kodekaiWindowId = windowManager.createWindow({
      title: "Kodekai",
      size: { width: 760, height: 500 },
      minimumSize: { width: 520, height: 320 },
      content: () => <Kodekai />,
    });
  };

  onMount(() => {
    openFiles();
    openKodekai();
  });

  onCleanup(() => {
    if (windowId) {
      windowManager.removeWindow(windowId);
      windowId = undefined;
    }
    if (kodekaiWindowId) {
      windowManager.removeWindow(kodekaiWindowId);
      kodekaiWindowId = undefined;
    }
  });

  return (
    <div x-role="desktop root" class="relative h-full w-full text-base">
      <WindowsOutlet />
      <Taskbar onLaunchFiles={openFiles} />
    </div>
  );
}
