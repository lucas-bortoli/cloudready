import { splitProps, type JSX } from "solid-js";
import { cn } from "../../lib/dom";

type NativeTextareaProps = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  | "aria-disabled"
  | "aria-multiline"
  | "class"
  | "defaultValue"
  | "disabled"
  | "onBeforeInput"
  | "onChange"
  | "onDrop"
  | "onInput"
  | "onKeyDown"
  | "onPaste"
  | "role"
  | "rows"
  | "value"
  | "wrap"
>;

/**
 * Properties accepted by {@link TextInput}.
 *
 * The component is controlled: `value` is its sole source of truth and `onValueChange` reports
 * edits. It always renders a textarea. By default it behaves as a single-line textbox; set
 * `multiLine` to opt into native multiline textarea behavior.
 */
export interface TextInputProps extends NativeTextareaProps {
  /** Additional Tailwind classes appended after the component's standard classes. */
  class?: string;
  /**
   * Keeps the control focusable while preventing user edits.
   *
   * This intentionally renders `aria-disabled` instead of a native `disabled` attribute.
   */
  disabled?: boolean;
  /**
   * Enables native multiline textarea behavior.
   *
   * Omit this property for the default single-line experiment, which removes line breaks.
   */
  multiLine?: boolean;
  /** Receives the normalized current value after an accepted user edit. */
  onValueChange: (value: string) => void;
  /** Native key handler invoked after TextInput applies its Enter and disabled guards. */
  onKeyDown?: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent>;
  /** Number of visible rows in multiline mode. Defaults to `3`. */
  rows?: number;
  /** The current controlled text value. */
  value: string;
  /**
   * Optional stable semantic role forwarded unchanged to the native textarea.
   *
   * When omitted, no `x-role` attribute is rendered.
   */
  "x-role"?: string;
}

/** Removes every browser line-ending representation from a single-line value. */
function removeLineBreaks(value: string) {
  return value.replace(/\r\n|[\r\n]/g, "");
}

/**
 * Renders a controlled text editor backed by a native textarea.
 *
 * By default, it is a compact single-line textbox: Enter is prevented and typed or pasted line
 * breaks are removed before `onValueChange` runs. Setting `multiLine` retains native textarea
 * semantics and line breaks. Disabled controls remain focusable, expose `aria-disabled`, and
 * reject edits without stopping event propagation. The component never throws.
 */
export default function TextInput(props: TextInputProps) {
  const [local, nativeProps] = splitProps(props, [
    "class",
    "disabled",
    "multiLine",
    "onKeyDown",
    "onValueChange",
    "rows",
    "spellcheck",
    "value",
    "x-role",
  ]);
  const isInactive = () => local.disabled ?? false;
  const isMultiLine = () => local.multiLine ?? false;

  function preventEdits(event: InputEvent | ClipboardEvent | DragEvent) {
    if (isInactive()) {
      event.preventDefault();
    }
  }

  function handleInput(event: InputEvent & { currentTarget: HTMLTextAreaElement }) {
    const textarea = event.currentTarget;

    if (isInactive()) {
      textarea.value = local.value;
      return;
    }

    const nextValue = isMultiLine() ? textarea.value : removeLineBreaks(textarea.value);

    if (textarea.value !== nextValue) {
      textarea.value = nextValue;
    }

    local.onValueChange(nextValue);
  }

  const handleKeyDown: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent> = (event) => {
    if (isInactive() || (!isMultiLine() && event.key === "Enter")) {
      event.preventDefault();
    }

    local.onKeyDown?.(event);
  };

  return (
    <textarea
      {...nativeProps}
      aria-disabled={isInactive() || undefined}
      aria-multiline={isMultiLine() ? undefined : false}
      class={cn(
        "block min-w-0 rounded-xs border border-neutral-400 bg-neutral-50 text-neutral-800 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
        isMultiLine()
          ? "min-h-20 resize-none overflow-y-auto px-2 py-1.5"
          : "h-7 resize-none overflow-y-hidden px-2 pt-0.75 leading-5 whitespace-nowrap",
        local.class,
      )}
      role={isMultiLine() ? undefined : "textbox"}
      rows={isMultiLine() ? (local.rows ?? 3) : 1}
      spellcheck={local.spellcheck ?? false}
      value={local.value}
      wrap={isMultiLine() ? undefined : "off"}
      x-role={local["x-role"]}
      onBeforeInput={preventEdits}
      onDrop={preventEdits}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={preventEdits}
    />
  );
}
