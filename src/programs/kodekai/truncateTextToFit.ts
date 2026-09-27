/** Finds the longest whole-word prefix that fits an element according to a measurement callback. */
export function truncateTextToFit(
  content: string,
  element: HTMLElement,
  fits: () => boolean,
): string {
  const words = content.split(/\s+/);
  const contentFor = (count: number) => {
    const value = words.slice(0, count).join(" ");
    return count === words.length ? value : `${value}\u2026`;
  };

  let minimum = 0;
  let maximum = words.length;
  while (minimum < maximum) {
    const midpoint = Math.ceil((minimum + maximum) / 2);
    element.textContent = contentFor(midpoint);
    if (fits()) {
      minimum = midpoint;
    } else {
      maximum = midpoint - 1;
    }
  }

  return contentFor(minimum);
}
