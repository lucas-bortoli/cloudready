import { createEffect, For, splitProps, type JSX } from "solid-js";
import { cn } from "../../lib/dom";

type NativeSelectProps = Omit<
  JSX.SelectHTMLAttributes<HTMLSelectElement>,
  | "aria-disabled"
  | "children"
  | "class"
  | "defaultValue"
  | "disabled"
  | "multiple"
  | "onChange"
  | "onKeyDown"
  | "size"
  | "value"
>;

/** A selectable native option rendered by {@link Dropdown}. */
export interface DropdownOption {
  /** Visible label and accessible name for the option. */
  label: string;
  /** Prevents selection of this individual native option. */
  disabled?: boolean;
  /** Stable value reported when this option is selected. */
  value: string;
}

/**
 * Properties accepted by {@link Dropdown}.
 *
 * Dropdown is controlled: `value` is its sole source of truth and `onValueChange` reports an
 * accepted user selection. `value` must identify an option in `options`.
 */
export interface DropdownProps extends NativeSelectProps {
  /** Additional Tailwind classes appended after the component's standard classes. */
  class?: string;
  /**
   * Keeps the control focusable while preventing selection changes.
   *
   * This intentionally renders `aria-disabled` instead of a native `disabled` attribute.
   */
  disabled?: boolean;
  /** Receives the value requested by an accepted user selection. */
  onValueChange: (value: string) => void;
  /** Native key handler invoked after Dropdown applies its inactive-state guard. */
  onKeyDown?: JSX.EventHandler<HTMLSelectElement, KeyboardEvent>;
  /** The available choices rendered as native options. */
  options: readonly DropdownOption[];
  /** The current controlled selected value. */
  value: string;
  /**
   * Optional stable semantic role forwarded unchanged to the native select.
   *
   * When omitted, no `x-role` attribute is rendered.
   */
  "x-role"?: string;
}

/**
 * Renders a controlled, compact native select control with custom trigger chrome.
 *
 * Native options retain their browser keyboard, accessibility, and form semantics. Disabled
 * Dropdowns remain focusable, expose `aria-disabled`, reject selection changes, and allow events
 * to bubble. This component never throws.
 */
export default function Dropdown(props: DropdownProps) {
  const [local, nativeProps] = splitProps(props, [
    "class",
    "disabled",
    "onKeyDown",
    "onValueChange",
    "options",
    "value",
    "x-role",
  ]);
  let select: HTMLSelectElement | undefined;
  const isInactive = () => local.disabled ?? false;

  createEffect(() => {
    if (select) {
      select.value = local.value;
    }
  });

  const handleChange: JSX.EventHandler<HTMLSelectElement, Event> = (event) => {
    if (isInactive()) {
      event.currentTarget.value = local.value;
      return;
    }

    local.onValueChange(event.currentTarget.value);
  };

  const handleKeyDown: JSX.EventHandler<HTMLSelectElement, KeyboardEvent> = (event) => {
    if (isInactive() && [" ", "ArrowDown", "ArrowUp", "Enter", "Home", "End"].includes(event.key)) {
      event.preventDefault();
    }

    local.onKeyDown?.(event);
  };

  return (
    <div class="relative inline-block justify-self-start">
      <select
        {...nativeProps}
        ref={select}
        aria-disabled={isInactive() || undefined}
        class={cn(
          "relative z-0 block h-7 min-w-0 cursor-pointer appearance-none rounded-xs border border-neutral-400 bg-neutral-50 py-0 pr-7 pl-2 text-neutral-800 shadow transition-colors hover:bg-neutral-200 focus:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
          local.class,
        )}
        value={local.value}
        x-role={local["x-role"]}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      >
        <For each={local.options}>
          {(option) => (
            <option disabled={option.disabled} value={option.value}>
              {option.label}
            </option>
          )}
        </For>
      </select>
      <svg
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-2 z-10 size-4 -translate-y-1/2 text-neutral-500"
        fill="none"
        viewBox="0 0 12 12"
      >
        <path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-linecap="round" stroke-width="1.25" />
      </svg>
    </div>
  );
}
