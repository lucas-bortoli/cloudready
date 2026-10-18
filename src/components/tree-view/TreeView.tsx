import { createMemo, createSignal, For, Show, untrack } from "solid-js";
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
  const initiallyExpanded = untrack(() => {
    const expanded = new Set<N>();
    const collectExpanded = (nodes: ReadonlyArray<N>) => {
      nodes.forEach((node) => {
        const children = props.explore(node).children;
        if (children.length > 0) {
          expanded.add(node);
          collectExpanded(children);
        }
      });
    };
    collectExpanded(props.root);
    return expanded;
  });

  const [expandedNodes, setExpandedNodes] = createSignal(initiallyExpanded);
  const [selectionAnchor, setSelectionAnchor] = createSignal<N>();

  function getVisibleNodes() {
    const visibleNodes: N[] = [];
    const visit = (nodes: ReadonlyArray<N>) => {
      nodes.forEach((node) => {
        visibleNodes.push(node);
        if (expandedNodes().has(node)) visit(props.explore(node).children);
      });
    };
    visit(props.root);
    return visibleNodes;
  }

  function handleExpansionClick(node: N) {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(node)) next.delete(node);
      else next.add(node);
      return next;
    });
  }

  function handleNodeClick(node: N, event: MouseEvent) {
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
    } else if (event.shiftKey) {
      const visibleNodes = getVisibleNodes();
      const anchor = selectionAnchor() ?? node;
      const anchorIndex = visibleNodes.indexOf(anchor);
      const nodeIndex = visibleNodes.indexOf(node);
      const range =
        anchorIndex < 0 || nodeIndex < 0
          ? [node]
          : visibleNodes.slice(
              Math.min(anchorIndex, nodeIndex),
              Math.max(anchorIndex, nodeIndex) + 1,
            );
      next = event.ctrlKey ? [...new Set([...old, ...range])] : range;
    } else if (event.ctrlKey) {
      // Ctrl-click toggles only the clicked node.
      next = old.includes(node)
        ? old.filter((selectedNode) => selectedNode !== node)
        : [...old, node];
    } else {
      // An ordinary click replaces the multiple selection with this node.
      next = [node];
    }

    if (!event.shiftKey) setSelectionAnchor(() => node);
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
    const handleClick = (event: MouseEvent) => handleNodeClick(itemProps.node, event);
    const handleExpandClick = () => handleExpansionClick(itemProps.node);
    const isExpanded = () => expandedNodes().has(itemProps.node);
    const hasChildren = () => info().children.length > 0;

    const HierarchyGuide = () => {
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
        <Show when={depth > 0}>
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
        </Show>
      );
    };

    return (
      <li>
        <header class={cn("flex h-6 items-center leading-none")}>
          <HierarchyGuide />
          <Show when={hasChildren()}>
            <button
              type="button"
              aria-label={`${isExpanded() ? "Collapse" : "Expand"} ${info().label}`}
              aria-expanded={isExpanded()}
              class="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-neutral-400 text-neutral-600 outline-sky-200 hover:bg-neutral-200 focus:outline-2 focus:outline-offset-0"
              onClick={handleExpandClick}
            >
              <svg
                aria-hidden="true"
                class={cn("size-3 transition-transform", isExpanded() && "rotate-90")}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="m4 2 4 4-4 4" />
              </svg>
            </button>
          </Show>
          <span
            class={cn(
              "cursor-pointer rounded-xs px-1 py-1 text-nowrap -outline-offset-1 hover:bg-neutral-100",
              props.selection.includes(itemProps.node) && "bg-sky-200! outline-1 outline-sky-300",
            )}
            onClick={handleClick}
          >
            {info().label}
          </span>
        </header>
        <Show when={hasChildren() && isExpanded()}>
          <Level
            items={info().children}
            ancestorHasNext={[...itemProps.ancestorHasNext, !itemProps.isLast]}
          />
        </Show>
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
