import type { JSX } from "solid-js";
import ResizableSidebar from "../sidebar/ResizableSidebar";

export interface AppFrame {
  frameKey: string;
  sidebar?: {
    /**
     * The selected item's key, or null when no item is selected.
     */
    selectedItem: string | null;
    /**
     * Called with an item's key when it is clicked.
     */
    setSelectedItem: (key: string) => void;
    /**
     * The sidebar's contents
     */
    children?: JSX.Element;
  };
}

export default function AppFrame(props: AppFrame) {
  return (
    <main x-role="app frame" class="bg-white">
      {props.sidebar && (
        <ResizableSidebar
          class="border-r border-neutral-200"
          selectedItem={props.sidebar.selectedItem}
          setSelectedItem={props.sidebar.setSelectedItem}
          children
        />
      )}
    </main>
  );
}
