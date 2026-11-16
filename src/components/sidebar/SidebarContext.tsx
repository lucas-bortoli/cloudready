import { createContext, useContext, type ParentProps } from "solid-js";

interface SidebarContextValue {
  selectedItem: string | null;
  setSelectedItem: (key: string) => void;
}

const SidebarContext = createContext<SidebarContextValue>();

/**

 * Provides controlled selection state to sidebar items.

 */
export function SidebarProvider(props: ParentProps<SidebarContextValue>) {
  return <SidebarContext.Provider value={props}>{props.children}</SidebarContext.Provider>;
}

/**
 * Returns the enclosing sidebar's selection state.
 *
 * @throws {Error} If called outside a SidebarProvider.
 */
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("SidebarItem must be used within a Sidebar");
  return context;
}
