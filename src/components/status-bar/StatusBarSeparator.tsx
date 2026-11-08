import type { ParentProps } from "solid-js";
import { cn } from "../../lib/dom";

export interface StatusBarSeparatorProps extends ParentProps {
  className?: string;
}

export default function StatusBarSeparator(props: StatusBarSeparatorProps) {
  return (
    <span
      x-role="status bar separator"
      role="separator"
      class={cn("mx-2 h-full w-px bg-neutral-200", props.className)}
    >
      {props.children}
    </span>
  );
}
