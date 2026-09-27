declare const isoDateTimeBrand: unique symbol;

/** A canonical ISO 8601 UTC datetime, such as `2026-09-27T15:30:00.000Z`. */
export type IsoDateTime = string & { readonly [isoDateTimeBrand]: "IsoDateTime" };

/** Thrown when a value is not a canonical ISO 8601 UTC datetime. */
export class InvalidIsoDateTimeError extends Error {
  constructor(value: string) {
    super(`Invalid ISO datetime: ${value}`);
    this.name = "InvalidIsoDateTimeError";
  }
}

/**
 * Parses a canonical ISO 8601 UTC datetime.
 *
 * @throws {InvalidIsoDateTimeError} If `value` is not a valid canonical ISO datetime.
 */
export function parseIsoDateTime(value: string): IsoDateTime {
  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new InvalidIsoDateTimeError(value);
  }

  return value as IsoDateTime;
}

/**
 * Converts a date to its canonical ISO 8601 UTC representation.
 *
 * @throws {InvalidIsoDateTimeError} If `date` is invalid.
 */
export function formatIsoDateTime(date: Date): IsoDateTime {
  try {
    return date.toISOString() as IsoDateTime;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new InvalidIsoDateTimeError(String(date));
    }

    throw error;
  }
}
