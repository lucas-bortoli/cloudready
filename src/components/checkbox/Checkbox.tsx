import { createEffect, splitProps, type JSX } from "solid-js";
import { cn } from "../../lib/dom";

type NativeCheckboxProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  | "aria-checked"
  | "aria-disabled"
  | "checked"
  | "children"
  | "class"
  | "defaultChecked"
  | "disabled"
  | "onChange"
  | "onClick"
  | "type"
>;

/**
 * Properties accepted by {@link Checkbox}.
 *
 * Checkbox is controlled: `checked` is its source of truth and `onCheckedChange` reports an
 * accepted activation. Set `indeterminate` for a mixed state, which requests `true` when activated.
 */
export interface CheckboxProps extends NativeCheckboxProps {
  /** Visible content associated with the checkbox through its enclosing native label. */
  children: JSX.Element;
  /** Additional Tailwind classes appended to the enclosing label. */
  class?: string;
  /** The current controlled boolean state. */
  checked: boolean;
  /**
   * Keeps the checkbox focusable while preventing state changes.
   *
   * This intentionally renders `aria-disabled` instead of a native `disabled` attribute.
   */
  disabled?: boolean;
  /** Displays the native mixed state and requests `checked=true` on activation. */
  indeterminate?: boolean;
  /** Receives the next requested boolean state after an accepted activation. */
  onCheckedChange: (checked: boolean) => void;
  /**
   * Optional stable semantic role forwarded unchanged to the native input.
   *
   * When omitted, no `x-role` attribute is rendered.
   */
  "x-role"?: string;
}

/**
 * Renders a controlled, native-checkbox-backed selection control.
 *
 * The input remains the form control and keyboard target while a decorative sibling renders the
 * compact desktop checkbox appearance. `indeterminate` synchronizes the input's DOM-only mixed
 * property and reports a checked state when activated. Disabled checkboxes remain focusable,
 * expose `aria-disabled`, reject state changes, and allow events to bubble. This component never
 * throws.
 */
export default function Checkbox(props: CheckboxProps) {
  const [local, nativeProps] = splitProps(props, [
    "children",
    "class",
    "checked",
    "disabled",
    "indeterminate",
    "onCheckedChange",
    "x-role",
  ]);
  let input: HTMLInputElement | undefined;
  const isInactive = () => local.disabled ?? false;
  const isIndeterminate = () => local.indeterminate ?? false;

  createEffect(() => {
    if (input) {
      input.indeterminate = isIndeterminate();
    }
  });

  const handleClick: JSX.EventHandler<HTMLInputElement, MouseEvent> = (event) => {
    if (isInactive()) {
      event.preventDefault();
      return;
    }

    local.onCheckedChange(isIndeterminate() ? true : event.currentTarget.checked);
  };

  return (
    <label
      class={cn(
        "inline-flex cursor-pointer items-center gap-2 text-neutral-800",
        isInactive() && "cursor-not-allowed opacity-55",
        local.class,
      )}
    >
      <input
        type="checkbox"
        {...nativeProps}
        ref={input}
        aria-checked={isIndeterminate() ? "mixed" : undefined}
        aria-disabled={isInactive() || undefined}
        checked={local.checked}
        class="peer sr-only"
        x-role={local["x-role"]}
        onClick={handleClick}
      />
      <span
        aria-hidden="true"
        class="grid size-4 place-items-center rounded-xs border border-neutral-400 bg-neutral-50 shadow-sm transition-colors peer-hover:bg-neutral-200 peer-focus:bg-neutral-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 peer-aria-disabled:cursor-not-allowed"
        data-state={isIndeterminate() ? "mixed" : local.checked ? "checked" : "unchecked"}
      >
        {isIndeterminate() ? (
          <svg class="size-3" fill="none" viewBox="0 0 12 12">
            <path d="M2.5 6h7" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
          </svg>
        ) : (
          local.checked && (
            <svg class="size-3" fill="none" viewBox="0 0 12 12">
              <path
                d="m2.5 6 2.1 2.1L9.5 3.5"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
              />
            </svg>
          )
        )}
      </span>
      <span>{local.children}</span>
    </label>
  );
}
