import type { JSX } from "solid-js";
import { cn } from "../../lib/dom";

/** Visual emphasis applied to a {@link Button}. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type NativeButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-busy" | "aria-disabled" | "children" | "class" | "disabled" | "onClick" | "title" | "type"
>;

/** Shared properties accepted by every {@link Button}. */
interface ButtonCommonProps extends NativeButtonProps {
  /**
   * The accessible name supplied by the caller.
   *
   * For textless buttons, this overrides the label derived from `title`.
   */
  "aria-label"?: string;
  /** Additional Tailwind classes appended after the component's standard classes. */
  class?: string;
  /**
   * Keeps the control in the tab order while making it inactive.
   *
   * This intentionally produces `aria-disabled` rather than a native `disabled` attribute.
   */
  disabled?: boolean;
  /** Decorative content shown before the button label. */
  startIcon?: JSX.Element;
  /** Decorative content shown after the button label. */
  endIcon?: JSX.Element;
  /**
   * Shows a busy indicator and temporarily makes the control inactive.
   *
   * The original contents remain in layout so the button does not change width.
   */
  loading?: boolean;
  /** Consumer handler invoked only while the button is active. */
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
  /** Native button type. Defaults to `"button"` to avoid accidental form submission. */
  type?: "button" | "submit" | "reset";
  /** Visual emphasis. Defaults to `"secondary"`. */
  variant?: ButtonVariant;
  /**
   * Optional stable semantic role forwarded unchanged to the native button.
   *
   * When omitted, no `x-role` attribute is rendered.
   */
  "x-role"?: string;
}

/**
 * Properties accepted by {@link Button}.
 *
 * `title` is forwarded as the native tooltip and used as the accessible name unless `aria-label`
 * is supplied. Buttons without visible text should provide one of those properties.
 */
export type ButtonProps = ButtonCommonProps & {
  /** Content visible within the button. */
  children?: JSX.Element;
  /** Native tooltip text and fallback accessible name. */
  title?: string;
};

/**
 * Renders a consistently styled native button with accessible, focusable inactive states.
 *
 * It defaults to a non-submitting button and forwards safe native button attributes. Setting
 * `disabled` or `loading` adds `aria-disabled`, keeps the element focusable, prevents the click's
 * default action, and skips `onClick`; the event is deliberately allowed to bubble. `x-role` is
 * forwarded only when a caller supplies it. This component never throws.
 */
export default function Button(props: ButtonProps) {
  const {
    "aria-label": ariaLabel,
    children,
    class: className,
    disabled = false,
    endIcon,
    loading = false,
    onClick,
    startIcon,
    title,
    type = "button",
    variant = "secondary",
    "x-role": xRole,
    ...nativeProps
  } = props;
  const isInactive = () => disabled || loading;

  const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    // Unlike native disabled buttons, inactive buttons remain reachable by keyboard navigation.
    if (isInactive()) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  return (
    <button
      {...nativeProps}
      aria-busy={loading || undefined}
      aria-disabled={isInactive() || undefined}
      aria-label={ariaLabel ?? title}
      class={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm font-medium shadow transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
        variant === "primary" &&
          "border border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 focus:bg-neutral-700 active:bg-neutral-900",
        variant === "secondary" &&
          "border border-neutral-400 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 focus:bg-neutral-200 active:bg-neutral-300",
        variant === "ghost" &&
          "border border-transparent bg-transparent text-neutral-700 shadow-none hover:bg-neutral-100 focus:bg-neutral-100 active:bg-neutral-200",
        variant === "danger" &&
          "border border-neutral-400 bg-neutral-100 text-neutral-800 hover:border-red-400 hover:bg-red-50 hover:text-red-700 focus:border-red-400 focus:bg-red-50 focus:text-red-700 active:bg-red-100",
        "h-7 gap-1.5 px-4",
        className,
      )}
      title={title}
      type={type}
      x-role={xRole}
      onClick={handleClick}
    >
      <span class={loading ? "invisible contents" : "contents"}>
        {startIcon && (
          <span aria-hidden="true" class="inline-flex shrink-0">
            {startIcon}
          </span>
        )}
        {children}
        {endIcon && (
          <span aria-hidden="true" class="inline-flex shrink-0">
            {endIcon}
          </span>
        )}
      </span>
      {loading && (
        <svg
          aria-hidden="true"
          class="absolute size-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
          <path
            class="opacity-90"
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="3"
          />
        </svg>
      )}
    </button>
  );
}
