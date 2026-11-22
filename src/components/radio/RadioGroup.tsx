import type { JSX } from "@solidjs/web";
import { createContext, useContext } from "solid-js";

interface RadioGroupContextValue {
  name: () => string;
  onValueChange: (value: string) => void;
  value: () => string;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

/** Raised when a {@link Radio} is rendered without a containing {@link RadioGroup}. */
export class RadioGroupContextError extends Error {
  constructor() {
    super("Radio must be rendered within a RadioGroup.");
    this.name = "RadioGroupContextError";
  }
}

/**
 * Properties accepted by {@link RadioGroup}.
 *
 * RadioGroup provides selection state to descendant Radios but deliberately renders no DOM element.
 * Callers own group layout and labeling, including any fieldset or legend they need.
 */
export interface RadioGroupProps {
  /** Radio options that consume this group's context. */
  children: JSX.Element;
  /** Stable native form name shared by every descendant Radio. */
  name: string;
  /** Receives the value requested by an activated Radio. */
  onValueChange: (value: string) => void;
  /** The selected controlled option value. */
  value: string;
}

/** Provides controlled native-radio selection state without rendering a wrapper element. */
export default function RadioGroup(props: RadioGroupProps) {
  return (
    <RadioGroupContext
      value={{
        name: () => props.name,
        onValueChange: (value) => props.onValueChange(value),
        value: () => props.value,
      }}
    >
      {props.children}
    </RadioGroupContext>
  );
}

/**
 * Returns the nearest RadioGroup context.
 *
 * @throws {RadioGroupContextError} When called without a containing RadioGroup.
 */
export function useRadioGroup() {
  const radioGroup = useContext(RadioGroupContext);

  if (!radioGroup) {
    throw new RadioGroupContextError();
  }

  return radioGroup;
}
