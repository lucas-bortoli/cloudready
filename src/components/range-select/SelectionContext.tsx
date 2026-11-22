import { createContext, createSignal, useContext, type Accessor, type ParentProps } from "solid-js";

interface SelectionContextValue {
  selectedItems: Accessor<ReadonlySet<unknown>>;
  setSelectedItems: (items: ReadonlySet<unknown>) => void;
  selectionAnchor: Accessor<unknown>;
  setSelectionAnchor: (value: unknown) => void;
  items: Map<HTMLElement, Accessor<unknown>>;
}

const SelectionContext = createContext<SelectionContextValue>();

/** Thrown when a selection directive is used outside a selection provider. */
export class SelectionContextError extends Error {
  public constructor() {
    super("SelectionProvider is missing.");
    this.name = "SelectionContextError";
  }
}

export interface SelectionProviderProps<T> extends ParentProps {
  selectedItems: Accessor<ReadonlySet<T>>;
  setSelectedItems: (items: ReadonlySet<T>) => void;
}

/** Supplies selection state and item registration to selection directives. */
export function SelectionProvider<T>(props: SelectionProviderProps<T>) {
  const [selectionAnchor, setSelectionAnchor] = createSignal<unknown>(null);
  const context: SelectionContextValue = {
    selectedItems: () => props.selectedItems(),
    setSelectedItems: (items) => props.setSelectedItems(items as ReadonlySet<T>),
    selectionAnchor,
    setSelectionAnchor: (value) => setSelectionAnchor(() => value),
    items: new Map(),
  };
  return <SelectionContext value={context}>{props.children}</SelectionContext>;
}

/**
 * Returns the nearest selection context.
 *
 * @throws {SelectionContextError} When called outside a SelectionProvider.
 */
export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) throw new SelectionContextError();
  return context;
}
