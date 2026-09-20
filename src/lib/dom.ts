/**
 * Joins truthy CSS class names into a single class attribute value.
 *
 * Falsy values are ignored, making conditional classes convenient without
 * producing extra whitespace.
 *
 * @param classNames Class names and optional conditional values to combine.
 * @returns The space-separated class list.
 */
export function cn(...classNames: (string | boolean | null | undefined)[]) {
  return classNames.filter(Boolean).join(" ");
}
