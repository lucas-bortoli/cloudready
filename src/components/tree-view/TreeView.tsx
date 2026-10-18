import { createMemo, For } from "solid-js";
import { cn } from "../../lib/dom";

export type SelectionMode = "none" | "single" | "multiple";

export type NodeInfo<N> = {
  label: string;
  children: ReadonlyArray<N>;
  value: N;
};

export interface TreeViewProps<N> {
  root: ReadonlyArray<N>;
  explore: (node: N) => NodeInfo<N>;

  selectionMode?: SelectionMode;
  /** The selected nodes, owned by the parent component. */
  selection: ReadonlyArray<N>;
  /** Called with the next selection after a selectable node is clicked. */
  onSelectionChange?: (selection: ReadonlyArray<N>) => void;

  class?: string;
}

export default function TreeView<N>(props: TreeViewProps<N>) {
  function handleNodeClick(node: N) {
    const mode = props.selectionMode ?? "multiple";

    // "none" keeps the parent's current selection unchanged.
    if (mode === "none") return;

    const old = props.selection;
    let next: ReadonlyArray<N>;

    if (mode === "single") {
      // Clicking the selected node clears it; otherwise replace selection.
      if (old.includes(node)) {
        next = [];
      } else {
        next = [node];
      }
    } else if (old.includes(node)) {
      // Multiple mode toggles only the clicked node.
      next = old.filter((selectedNode) => selectedNode !== node);
    } else {
      next = [...old, node];
    }

    props.onSelectionChange?.(next);
  }

  const Level = (levelProps: { items: ReadonlyArray<N> }) => {
    return (
      <ul class="pl-4">
        <For each={levelProps.items} children={(node) => <Node node={node} />} />
      </ul>
    );
  };

  const Node = (itemProps: { node: N }) => {
    const info = createMemo(() => props.explore(itemProps.node));

    return (
      <li>
        <header
          class={cn(
            "inline-block px-2",
            props.selection.includes(itemProps.node) &&
              "bg-sky-200 outline-1 -outline-offset-1 outline-sky-300",
          )}
          onClick={() => handleNodeClick(itemProps.node)}
        >
          <span class="text-nowrap">{info().label}</span>
        </header>
        <Level items={info().children} />
      </li>
    );
  };

  return (
    <div
      x-role="treeview"
      role="tree"
      class={cn("overflow-y-auto border border-neutral-600 p-1 *:pl-0", props.class)}
    >
      <Level items={props.root} />
    </div>
  );
}
