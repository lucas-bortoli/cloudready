import { For } from "solid-js";
import { Dynamic } from "solid-js/web";

interface CarbonIconNode {
  attrs: Record<string, string | number>;
  elem: string;
}

interface CarbonIconDescriptor {
  attrs: Record<string, string | number>;
  content: CarbonIconNode[];
}

interface CarbonIconProps {
  icon: CarbonIconDescriptor;
}

export default function CarbonIcon(props: CarbonIconProps) {
  return (
    <svg {...props.icon.attrs} aria-hidden="true">
      <For each={props.icon.content}>
        {(node) => <Dynamic component={node.elem} {...node.attrs} />}
      </For>
    </svg>
  );
}
