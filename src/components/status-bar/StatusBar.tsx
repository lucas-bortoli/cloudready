import type { ParentProps } from "solid-js";
import { cn } from "../../lib/dom";

export interface StatusBarProps extends ParentProps {
  className?: string;
}

export default function StatusBar(props: StatusBarProps) {
  return (
    <footer
      x-role="status bar"
      role="status"
      class={cn("flex h-7 shrink-0 items-center border-t border-neutral-200 px-1", props.className)}
    >
      {props.children}
    </footer>
  );
}
