import type { Accessor, JSX } from "solid-js";
import { contextMenu } from "./context-menu/contextMenu";
import { selectionBoundary, selectionItem } from "./range-select/rangeSelect";

/** Directives that components can explicitly forward to their underlying element. */
export const directiveRegistry = { contextMenu, selectionBoundary, selectionItem } as const;

type DirectiveName = keyof typeof directiveRegistry;

/** The `use:*` properties corresponding to the registered directives. */
export type ForwardedDirectiveProps = {
  [Name in DirectiveName as `use:${Name}`]?: JSX.Directives[Name];
};

/** Prop names to exclude from a component's DOM spread before forwarding directives. */
export const directivePropNames = (Object.keys(directiveRegistry) as DirectiveName[]).map(
  (name) => `use:${name}` as keyof ForwardedDirectiveProps,
);

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      forwardDirectives: ForwardedDirectiveProps;
    }
  }
}

/**
 * Applies registered `use:*` props to a component's underlying DOM element.
 *
 * Call during element creation within the component's Solid owner. Directives present at that
 * point are installed once, receive reactive accessors, and own their usual cleanup. Exclude
 * {@link directivePropNames} from the element's prop spread to avoid rendering them as attributes.
 *
 * @example
 * ```tsx
 * import { splitProps, type JSX } from "solid-js";
 * import { directivePropNames, forwardDirectives } from "./directives";
 * import { contextMenu } from "./context-menu/contextMenu";
 *
 * // Solid directives must remain in scope for the compiler.
 * void forwardDirectives;
 * void contextMenu;
 *
 * function MyButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
 *   const [directives, nativeProps] = splitProps(props, directivePropNames);
 *   return <button {...nativeProps} use:forwardDirectives={directives} />;
 * }
 *
 * function handleOpen() {
 *   console.log("Open");
 * }
 *
 * // Render inside a LayerProvider and ContextMenuProvider.
 * <MyButton use:contextMenu={[{ label: "Open", onSelect: handleOpen }]}>
 *   Actions
 * </MyButton>;
 * ```
 *
 * @param element The underlying DOM element.
 * @param props Accessor for the component's forwarded directive props.
 * @throws {ContextMenuContextError} When a context menu lacks its provider.
 * @throws {SelectionContextError} When a selection directive lacks its provider.
 * @throws {LayerContextError} When a selection boundary lacks its layer provider.
 */
export function forwardDirectives(element: HTMLElement, props: Accessor<ForwardedDirectiveProps>) {
  const current = props();
  for (const name of Object.keys(directiveRegistry) as DirectiveName[]) {
    const key = `use:${name}` as keyof ForwardedDirectiveProps;
    if (!(key in current)) continue;
    // Each registry key is paired with its directive's declared accessor type.
    const directive = directiveRegistry[name] as (
      element: HTMLElement,
      value: Accessor<unknown>,
    ) => void;
    directive(element, () => props()[key]);
  }
}
