import { Show } from "solid-js";
import CarbonIcon from "../../taskbar/CarbonIcon";

export interface ContextMenuActionProps {
  label: string;
  icon?: CarbonIconDescriptor;
  disabled?: boolean;
  showIconColumn: boolean;
  onSelect: () => void;
}

export default function ContextMenuAction(props: ContextMenuActionProps) {
  function handleSelect() {
    props.onSelect();
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.disabled}
      class="flex w-full items-center gap-2 px-2 py-1 text-left outline-sky-300 hover:bg-sky-100 focus:bg-sky-100 focus:outline-1 focus:outline-offset-2 disabled:opacity-50"
      onClick={handleSelect}
      onContextMenu={handleSelect}
    >
      <Show when={props.showIconColumn}>
        <span class="flex h-4 w-4 shrink-0 items-center justify-center">
          <Show when={props.icon}>{(icon) => <CarbonIcon icon={icon()} />}</Show>
        </span>
      </Show>
      {props.label}
    </button>
  );
}
