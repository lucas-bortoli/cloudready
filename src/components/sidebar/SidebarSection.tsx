import type { ParentProps } from "solid-js";

/**

 * Props for a labeled group of sidebar items.

 */
export interface SidebarSectionProps extends ParentProps {
  /**
   * Heading displayed above the items.
   */
  label: string;
}

/**

 * Groups sidebar items under a heading.

 */
export function SidebarSection(props: SidebarSectionProps) {
  return (
    <section>
      <h1 class="capitalize">{props.label}</h1>
      <ul class="flex flex-col gap-2">{props.children}</ul>
    </section>
  );
}
