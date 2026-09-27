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
  class?: string;
}

export default function CarbonIcon(props: CarbonIconProps) {
  return (
    <svg {...props.icon.attrs} class={props.class} aria-hidden="true">
      <For each={props.icon.content}>
        {(node) => <Dynamic component={node.elem} {...node.attrs} />}
      </For>
    </svg>
  );
}
