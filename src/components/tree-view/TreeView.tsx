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

  const Level = (levelProps: {
    items: ReadonlyArray<N>;
    ancestorHasNext: ReadonlyArray<boolean>;
  }) => {
    return (
      <ul class="m-0 list-none p-0">
        <For each={levelProps.items}>
          {(node, index) => (
            <Node
              node={node}
              isLast={index() === levelProps.items.length - 1}
              ancestorHasNext={levelProps.ancestorHasNext}
            />
          )}
        </For>
      </ul>
    );
  };

  const Node = (itemProps: {
    node: N;
    isLast: boolean;
    ancestorHasNext: ReadonlyArray<boolean>;
  }) => {
    const info = createMemo(() => props.explore(itemProps.node));
    const handleClick = () => handleNodeClick(itemProps.node);

    const HierarchyGuide = () => {
      if (itemProps.ancestorHasNext.length === 0) return null;

      const depth = itemProps.ancestorHasNext.length;
      const guideWidth = () => depth * 16;
      const guidePaths = () => {
        const paths = itemProps.ancestorHasNext
          .slice(1)
          .flatMap((hasNext, index) => (hasNext ? [`M ${8.5 + index * 16} 0 V 24`] : []));
        const branchX = 8.5 + (depth - 1) * 16;
        paths.push(
          `M ${branchX} 0 V ${itemProps.isLast ? 12 : 24}`,
          `M ${branchX} 12.5 H ${branchX + 8}`,
        );
        return paths;
      };

      return (
        <svg
          aria-hidden="true"
          class="shrink-0 text-neutral-300"
          width={guideWidth()}
          height="24"
          viewBox={`0 0 ${guideWidth()} 24`}
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          shape-rendering="crispEdges"
        >
          <For each={guidePaths()}>{(path) => <path d={path} />}</For>
        </svg>
      );
    };

    return (
      <li>
        <header class={cn("flex h-6 items-center leading-none")} onClick={handleClick}>
          <HierarchyGuide />
          <span
            class={cn(
              "cursor-pointer rounded-xs px-1 py-1 text-nowrap -outline-offset-1 hover:bg-neutral-100",
              props.selection.includes(itemProps.node) && "bg-sky-200! outline-1 outline-sky-300",
            )}
          >
            {info().label}
          </span>
        </header>
        <Level
          items={info().children}
          ancestorHasNext={[...itemProps.ancestorHasNext, !itemProps.isLast]}
        />
      </li>
    );
  };

  return (
    <div
      x-role="treeview"
      role="tree"
      class={cn("overflow-y-auto border border-neutral-600 p-1 *:pl-0", props.class)}
    >
      <Level items={props.root} ancestorHasNext={[]} />
    </div>
  );
}
