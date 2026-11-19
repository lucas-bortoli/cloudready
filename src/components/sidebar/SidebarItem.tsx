import type { ParentProps } from "solid-js";
import CarbonIcon from "../taskbar/CarbonIcon";
import { useSidebar } from "./SidebarContext";

/** Props for a selectable sidebar item. */
export interface SidebarItemProps extends ParentProps {
  /**
   * Carbon icon displayed beside the label.
   */
  icon: CarbonIconDescriptor;
  /**
   * Text displayed for the item.
   */
  label: string;
  /**
   * Key identifying this item within its sidebar.
   */
  itemKey: string;
  /**
   * Callback invoked when this item is clicked.
   */
  onClick?: () => void;
}

/**
 * Displays a selectable item, optionally containing nested sidebar items.
 * Must be rendered within a Sidebar.
 */
export function SidebarItem(props: SidebarItemProps) {
  const sidebar = useSidebar();
  const handleClick = () => {
    sidebar.setSelectedItem(props.itemKey);
    props.onClick?.();
  };

  return (
    <li class="flex flex-col items-stretch gap-0.5">
      <button
        class="relative flex cursor-pointer gap-2 rounded-sm p-2 outline-sky-300 transition-colors hover:bg-neutral-200 focus:z-10 focus:outline-2 focus:outline-offset-2 data-selected:bg-sky-100"
        data-selected={sidebar.selectedItem === props.itemKey ? "true" : undefined}
        onClick={handleClick}
      >
        <CarbonIcon class="shrink-0" icon={props.icon} />
        <h2 class="truncate">{props.label}</h2>
      </button>
      <ul class="relative flex flex-col gap-0.5 pl-8 before:absolute before:left-4 before:h-full before:w-px before:bg-neutral-200 empty:hidden">
        {props.children}
      </ul>
    </li>
  );
}
