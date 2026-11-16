import type { ParentProps } from "solid-js";
import { SidebarProvider } from "./SidebarContext";

/**

 * Props for a controlled sidebar selection.

 */
export interface SidebarProps extends ParentProps {
  /**
   * The selected item's key, or null when no item is selected.
   */
  selectedItem: string | null;
  /**
   * Called with an item's key when it is clicked.
   */
  setSelectedItem: (key: string) => void;
}

/**
 * Displays sidebar sections and provides selection state to their items.
 * Item keys must be unique within the sidebar.
 */
export default function Sidebar(props: SidebarProps) {
  return (
    <SidebarProvider selectedItem={props.selectedItem} setSelectedItem={props.setSelectedItem}>
      <aside class="w-50 shrink-0 flex-col overflow-y-auto bg-neutral-100 p-2">
        {props.children}
      </aside>
    </SidebarProvider>
  );
}
