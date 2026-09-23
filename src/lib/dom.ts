/**
 * Joins truthy CSS class names into a single class attribute value.
 *
 * Falsy values are ignored, making conditional Tailwind utilities convenient without producing
 * extra whitespace. Class names are preserved in argument order; this function does not merge,
 * deduplicate, or resolve conflicting utilities.
 *
 * Pass Tailwind utility strings directly to this function. The workspace Prettier configuration
 * and Tailwind CSS IntelliSense extension are configured to recognize `cn`, enabling class sorting,
 * completions, hover previews, linting, and color decorators within its arguments.
 *
 * @param classNames Class names and optional conditional values to combine.
 * @returns The space-separated class list.
 */
export function cn(...classNames: (string | boolean | null | undefined)[]) {
  return classNames.filter(Boolean).join(" ");
}
