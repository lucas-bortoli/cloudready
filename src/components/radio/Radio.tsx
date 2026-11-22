import type { JSX } from "@solidjs/web";
import { omit, Show } from "solid-js";
import { cn } from "../../lib/dom";
import { useRadioGroup } from "./RadioGroup";

type NativeRadioProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  | "aria-disabled"
  | "checked"
  | "children"
  | "class"
  | "defaultChecked"
  | "disabled"
  | "name"
  | "onChange"
  | "onClick"
  | "onKeyDown"
  | "type"
  | "value"
>;

/**
 * Properties accepted by {@link Radio}.
 *
 * Radio gets its native name, checked state, and selection callback from the nearest
 * {@link RadioGroup}. Its `value` identifies the option within that group.
 */
export interface RadioProps extends NativeRadioProps {
  /** Visible content associated with the radio through its enclosing native label. */
  children: JSX.Element;
  /** Additional Tailwind classes appended to the enclosing label. */
  class?: string;
  /**
   * Keeps the option focusable while preventing selection changes.
   *
   * This intentionally renders `aria-disabled` instead of a native `disabled` attribute.
   */
  disabled?: boolean;
  /** Native key handler invoked after Radio applies its inactive-state guard. */
  onKeyDown?: JSX.EventHandler<HTMLInputElement, KeyboardEvent>;
  /** The stable value represented by this option. */
  value: string;
  /**
   * Optional stable semantic role forwarded unchanged to the native input.
   *
   * When omitted, no `x-role` attribute is rendered.
   */
  "x-role"?: string;
}

/**
 * Renders a controlled, native-radio-backed option from the nearest {@link RadioGroup}.
 *
 * The input remains the form control and keyboard target while a decorative sibling renders the
 * compact desktop radio appearance. Inactive options remain focusable, expose `aria-disabled`,
 * reject selection changes, and let events bubble.
 *
 * @throws {RadioGroupContextError} When rendered without a containing RadioGroup.
 */
export default function Radio(props: RadioProps) {
  const radioGroup = useRadioGroup();
  const nativeProps = omit(props, "children", "class", "disabled", "onKeyDown", "value", "x-role");
  const isInactive = () => props.disabled ?? false;
  const isSelected = () => radioGroup.value() === props.value;
  const ariaDisabled = () => {
    if (isInactive()) return "true";
    return undefined;
  };

  const handleChange: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
    if (isInactive()) {
      event.currentTarget.checked = isSelected();
      return;
    }

    if (!isSelected()) {
      radioGroup.onValueChange(props.value);
    }
  };

  const handleClick: JSX.EventHandler<HTMLInputElement, MouseEvent> = (event) => {
    if (isInactive()) {
      event.preventDefault();
    }
  };

  const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (event) => {
    if (
      isInactive() &&
      [" ", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
    }

    props.onKeyDown?.(event);
  };

  return (
    <label
      class={cn(
        "inline-flex cursor-pointer items-center gap-2 text-neutral-800",
        isInactive() && "cursor-not-allowed opacity-55",
        props.class,
      )}
    >
      <input
        type="radio"
        {...nativeProps}
        aria-disabled={ariaDisabled()}
        checked={isSelected()}
        class="peer sr-only"
        name={radioGroup.name()}
        value={props.value}
        x-role={props["x-role"]}
        onChange={handleChange}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
      <span
        aria-hidden="true"
        class="grid size-4 place-items-center rounded-full border border-neutral-400 bg-neutral-50 shadow-sm outline-sky-300 transition-colors peer-hover:bg-neutral-200 peer-focus:bg-neutral-200 peer-focus:outline-2 peer-focus:outline-offset-2 peer-aria-disabled:cursor-not-allowed"
        data-state={isSelected() ? "checked" : "unchecked"}
      >
        <Show when={isSelected()}>
          <span class="size-2 rounded-full bg-neutral-800" />
        </Show>
      </span>
      <span>{props.children}</span>
    </label>
  );
}
