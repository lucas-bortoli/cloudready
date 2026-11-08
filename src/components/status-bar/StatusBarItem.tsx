import { cn } from "../../lib/dom";

export interface StatusBarItemProps {
  text: string;
  className?: string;
}

export default function StatusBarItem(props: StatusBarItemProps) {
  return (
    <span
      x-role="status bar item"
      role="status"
      class={cn("truncate", props.className)}
      title={props.text}
    >
      {props.text}
    </span>
  );
}
