import { splitProps, type JSX } from "solid-js";
import Calendar16 from "@carbon/icons/es/calendar/16.js";
import { cn } from "../../lib/dom";
import CarbonIcon from "../taskbar/CarbonIcon";

type NativeDateInputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  | "aria-disabled"
  | "class"
  | "defaultValue"
  | "disabled"
  | "onBeforeInput"
  | "onChange"
  | "onDrop"
  | "onInput"
  | "onClick"
  | "onKeyDown"
  | "onPaste"
  | "type"
  | "value"
>;

/**
 * Properties accepted by {@link DatePicker}.
 *
 * The component is controlled: `value` is its sole source of truth and `onValueChange` reports
 * user-selected browser-standard date values.
 */
export interface DatePickerProps extends NativeDateInputProps {
  /** Additional Tailwind classes appended after the component's standard classes. */
  class?: string;
  /**
   * Keeps the control focusable while preventing user edits.
   *
   * This intentionally renders `aria-disabled` instead of a native `disabled` attribute.
   */
  disabled?: boolean;
  /** Native click handler invoked before DatePicker opens the browser picker. */
  onClick?: JSX.EventHandler<HTMLInputElement, MouseEvent>;
  /** Native key handler invoked after DatePicker applies its inactive-state guard. */
  onKeyDown?: JSX.EventHandler<HTMLInputElement, KeyboardEvent>;
  /** Receives the browser-normalized current date value after an accepted user edit. */
  onValueChange: (value: string) => void;
  /** The current controlled date value in browser-standard `YYYY-MM-DD` format. */
  value: string;
  /**
   * Optional stable semantic role forwarded unchanged to the native input.
   *
   * When omitted, no `x-role` attribute is rendered.
   */
  "x-role"?: string;
}

/**
 * Renders a controlled compact native date control.
 *
 * The browser provides date-picker, keyboard, validation, and form semantics. Disabled controls
 * remain focusable, expose `aria-disabled`, and reject edits without stopping event propagation.
 * The component never throws.
 */
export default function DatePicker(props: DatePickerProps) {
  const [local, nativeProps] = splitProps(props, [
    "class",
    "disabled",
    "onClick",
    "onKeyDown",
    "onValueChange",
    "value",
    "x-role",
  ]);
  const isInactive = () => local.disabled ?? false;

  function preventEdits(event: InputEvent | ClipboardEvent | DragEvent) {
    if (isInactive()) {
      event.preventDefault();
    }
  }

  function handleInput(event: InputEvent & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;

    if (isInactive()) {
      input.value = local.value;
      return;
    }

    local.onValueChange(input.value);
  }

  const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (event) => {
    if (isInactive()) {
      event.preventDefault();
    }

    local.onKeyDown?.(event);
  };

  const handleClick: JSX.EventHandler<HTMLInputElement, MouseEvent> = (event) => {
    local.onClick?.(event);

    if (isInactive() || event.defaultPrevented) return;

    try {
      event.currentTarget.showPicker?.();
    } catch {
      // Browsers that reject programmatic picker opening retain their native click behavior.
    }
  };

  return (
    <div
      class={cn(
        "relative inline-block h-7 min-w-0 cursor-pointer justify-self-start rounded-xs border border-neutral-400 bg-neutral-50 text-neutral-800 shadow transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 hover:bg-neutral-200 focus:bg-neutral-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
        props.class,
      )}
      aria-disabled={isInactive() || undefined}
    >
      <input
        {...nativeProps}
        aria-disabled={isInactive() || undefined}
        class="relative z-0 block h-full w-full appearance-none py-0 pr-7 pl-2 outline-none [&::-webkit-calendar-picker-indicator]:opacity-0"
        type="date"
        value={local.value}
        x-role={local["x-role"]}
        onBeforeInput={preventEdits}
        onClick={handleClick}
        onDrop={preventEdits}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={preventEdits}
      />
      <CarbonIcon
        class="pointer-events-none absolute top-1/2 right-2 z-10 size-4 -translate-y-1/2 text-neutral-500"
        icon={Calendar16}
      />
    </div>
  );
}
