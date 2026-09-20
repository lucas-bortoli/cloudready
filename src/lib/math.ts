/**
 * Represents a 2D point with an x and y coordinate.
 */
export interface Point2d {
  x: number;
  y: number;
}

/**
 * Represents a size with a width and height.
 */
export interface Size2d {
  width: number;
  height: number;
}

export interface Rectangle extends Point2d, Size2d {}

/**
 * Snaps a number to the nearest multiple of a specified step size.
 * Effectively quantizes the value to a discrete set of values.
 * If the step size is zero, this returns zero.
 * @param value The value to snap.
 * @param step The step size.
 * @returns The snapped value, which is the nearest multiple of 'step' to 'value'.
 */
export function snap(value: number, step: number) {
  if (step === 0) return 0;

  return Math.floor(value / step) * step;
}

/**
 * Calculates the Euclidean distance between two points.
 * @param p1 The first point.
 * @param p2 The second point.
 * @returns The distance between the two points.
 */
export function distance(p1: Point2d, p2: Point2d) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * A range defined by a minimum and maximum value, both guaranteed to be finite.
 */
export interface Range {
  min: number;
  max: number;
}

export function range(min: number, max: number): Range {
  if (min > max) {
    throw new Error(`The range's minimum is larger than its maximum (min=${min} max=${max})`);
  }

  return { min, max };
}

/**
 * Checks if a number lies within a given range.
 *
 * @param n - The number to test.
 * @param range - The range to check against.
 * @returns `true` if `n` is greater than or equal to `range.min` and less than `range.max`.
 *
 * @example
 * const range = { min: 0, max: 10 };
 * isInRange(5, range); // true
 * isInRange(10, range); // false
 */
export function isInRange<N extends number>(n: N, range: Range) {
  return n >= range.min && n < range.max;
}
