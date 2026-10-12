import Taskbar from "../taskbar/TaskBar";
import WindowsOutlet from "../window-manager/WindowsOutlet";
import WindowSwitcher from "../window-manager/WindowSwitcher";

export default function Desktop() {
  return (
    <div x-role="desktop" class="relative h-full w-full overflow-hidden text-base">
      <WindowsOutlet />
      <Taskbar />
      <WindowSwitcher />
    </div>
  );
}
