import ChevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import { createEffect, For, omit, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { cn } from "../../lib/dom";
import CarbonIcon from "../taskbar/CarbonIcon";

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
 * accepted user selection. A `null` or `undefined` value represents no selection; otherwise,
 * `value` must identify an option in `options`.
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
  /** The current controlled selected value, or no selection. */
  value: string | null | undefined;
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
  const nativeProps = omit(
    props,
    "class",
    "disabled",
    "onKeyDown",
    "onValueChange",
    "options",
    "value",
    "x-role",
  );
  let select: HTMLSelectElement | undefined;
  const isInactive = () => props.disabled ?? false;

  const synchronizeSelection = (
    options: readonly DropdownOption[],
    value: string | null | undefined,
  ) => {
    if (!select) return;

    if (value == null || !options.some((option) => option.value === value)) {
      select.selectedIndex = -1;
    } else {
      select.value = value;
    }
  };

  createEffect(
    () => ({ options: props.options, value: props.value }),
    () => {
      onSettled(() => synchronizeSelection(props.options, props.value));
    },
  );

  const handleChange: JSX.EventHandler<HTMLSelectElement, Event> = (event) => {
    if (isInactive()) {
      synchronizeSelection(props.options, props.value);
      return;
    }

    props.onValueChange(event.currentTarget.value);
  };

  const handleKeyDown: JSX.EventHandler<HTMLSelectElement, KeyboardEvent> = (event) => {
    if (isInactive() && [" ", "ArrowDown", "ArrowUp", "Enter", "Home", "End"].includes(event.key)) {
      event.preventDefault();
    }

    props.onKeyDown?.(event);
  };

  return (
    <div
      class={cn(
        "relative inline-block h-7 min-w-0 cursor-pointer justify-self-start rounded-xs border border-neutral-400 bg-neutral-50 text-neutral-800 shadow transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-300 hover:bg-neutral-200 focus:bg-neutral-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
        props.class,
      )}
    >
      <select
        {...nativeProps}
        ref={select}
        aria-disabled={isInactive() ? "true" : undefined}
        class="relative z-0 block h-full w-full appearance-none py-0 pr-7 pl-2 outline-none"
        x-role={props["x-role"]}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      >
        <For each={props.options}>
          {(option) => (
            <option disabled={option.disabled} value={option.value}>
              {option.label}
            </option>
          )}
        </For>
      </select>
      <CarbonIcon
        class="pointer-events-none absolute top-1/2 right-2 z-10 size-4 -translate-y-1/2 text-neutral-600"
        icon={ChevronDown16}
      />
    </div>
  );
}
