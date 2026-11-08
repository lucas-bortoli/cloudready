export interface ContextMenuLabelProps {
  label: string;
}

export default function ContextMenuLabel(props: ContextMenuLabelProps) {
  return (
    <div role="presentation" class="px-2 py-1 capitalize">
      {props.label}
    </div>
  );
}
