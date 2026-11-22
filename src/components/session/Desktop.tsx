import { createSignal } from "solid-js";
import { layer } from "../layer-manager/layer";
import { createSelectionBoundaryRef } from "../range-select/rangeSelect";
import { SelectionProvider } from "../range-select/SelectionContext";
import Taskbar from "../taskbar/TaskBar";
import WindowsOutlet from "../window-manager/WindowsOutlet";
import WindowSwitcher from "../window-manager/WindowSwitcher";

export default function Desktop() {
  const [selectedIcons, setSelectedIcons] = createSignal(new Set());
  return (
    <div x-role="desktop" class="relative h-full w-full overflow-hidden text-base">
      <WindowsOutlet />
      <Taskbar />
      <WindowSwitcher />
      <SelectionProvider selectedItems={selectedIcons} setSelectedItems={setSelectedIcons}>
        <section
          x-role="desktop icons"
          ref={[layer(() => "background"), createSelectionBoundaryRef()]}
          class="absolute h-full w-full overflow-hidden"
        />
      </SelectionProvider>
    </div>
  );
}
