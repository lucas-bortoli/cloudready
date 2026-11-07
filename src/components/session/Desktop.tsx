import { createSignal } from "solid-js";
import { layer } from "../layer-manager/layer";
import { selectionBoundary } from "../range-select/rangeSelect";
import { SelectionProvider } from "../range-select/SelectionContext";
import Taskbar from "../taskbar/TaskBar";
import WindowsOutlet from "../window-manager/WindowsOutlet";
import WindowSwitcher from "../window-manager/WindowSwitcher";

void selectionBoundary;
void layer;

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
          use:selectionBoundary
          use:layer="background"
          class="absolute h-full w-full overflow-hidden"
        />
      </SelectionProvider>
    </div>
  );
}
