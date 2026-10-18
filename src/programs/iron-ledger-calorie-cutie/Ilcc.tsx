import { createSignal } from "solid-js";
import TreeView from "../../components/tree-view/TreeView";
import useWindowCloser from "../../components/window-manager/useWindowCloser";
import type WindowManager from "../../components/window-manager/WindowManager";
import type { Node, NodeNutrient } from "./model/current";
import { SAMPLE_DATA } from "./model/sample";

function Ilcc() {
  useWindowCloser(() => true);

  const [selection, setSelection] = createSignal<ReadonlyArray<Node>>([]);

  const exploreNode = (node: Node) => {
    switch (node.type) {
      case "year":
        return { label: String(node.year), children: node.children, value: node };
      case "month":
        return {
          label: new Date(2000, node.month).toLocaleString(undefined, { month: "long" }),
          children: node.children,
          value: node,
        };
      case "day":
        return { label: String(node.day).padStart(2, "0"), children: node.children, value: node };
      case "weight-change":
        return { label: `Weigh-in: ${node.value} kg`, children: [], value: node };
      case "height-change":
        return { label: `Height: ${node.value} cm`, children: [], value: node };
      case "meal":
        return { label: node.name, children: node.children, value: node };
      case "ingredient":
        return {
          label: `${node.name}: ${node.amount} ${node.unit}`,
          children: node.children,
          value: node,
        };
      case "nutrient":
        return {
          label: `${formatNutrient(node)}: ${node.value} ${node.unit}`,
          children: [],
          value: node,
        };
    }
  };

  const handleSelectionChange = (nextSelection: ReadonlyArray<Node>) => {
    setSelection(nextSelection);
  };

  return (
    <div class="flex h-full p-1">
      <TreeView
        root={SAMPLE_DATA.rootNodes}
        explore={exploreNode}
        selection={selection()}
        onSelectionChange={handleSelectionChange}
        class="w-72"
      />
    </div>
  );
}

function formatNutrient(node: NodeNutrient) {
  return node.nutrient
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

export default function createIlcc(windowManager: WindowManager) {
  windowManager.createWindow({
    title: "Iron Ledger: Calorie Cutie",
    size: { width: 960, height: 600 },
    minimumSize: { width: 640, height: 400 },
    content: Ilcc,
  });
}
