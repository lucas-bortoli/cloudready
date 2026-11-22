import type { ParentProps } from "solid-js";
import { cn } from "../../lib/dom";
import { SidebarProvider } from "./SidebarContext";

/**

 * Props for a controlled sidebar selection.

 */
export interface FixedSidebarProps extends ParentProps {
  /**
   * The selected item's key, or null when no item is selected.
   */
  selectedItem: string | null;
  /** Fill the available width instead of using the default width. */
  fill?: boolean;
  /**
   * Called with an item's key when it is clicked.
   */
  setSelectedItem: (key: string) => void;
  class?: string;
}

/**
 * Displays sidebar sections and provides selection state to their items.
 * Item keys must be unique within the sidebar.
 */
export default function FixedSidebar(props: FixedSidebarProps) {
  return (
    <SidebarProvider selectedItem={props.selectedItem} setSelectedItem={props.setSelectedItem}>
      <aside
        class={[
          cn("shrink-0 flex-col overflow-y-auto bg-neutral-100", props.class),
          { "w-full": props.fill, "w-50": !props.fill },
        ]}
      >
        {props.children}
      </aside>
    </SidebarProvider>
  );
}
