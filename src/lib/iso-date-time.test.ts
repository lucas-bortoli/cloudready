import { describe, expect, it } from "vitest";
import { formatIsoDateTime, InvalidIsoDateTimeError, parseIsoDateTime } from "./iso-date-time";

describe("ISO datetimes", () => {
  it("parses canonical UTC datetimes", () => {
    expect(parseIsoDateTime("2026-09-27T15:30:00.000Z")).toBe("2026-09-27T15:30:00.000Z");
  });

  it("rejects invalid and non-canonical datetimes", () => {
    expect(() => parseIsoDateTime("not a date")).toThrow(InvalidIsoDateTimeError);
    expect(() => parseIsoDateTime("2026-09-27T12:30:00-03:00")).toThrow(InvalidIsoDateTimeError);
  });

  it("formats valid dates and rejects invalid ones", () => {
    expect(formatIsoDateTime(new Date("2026-09-27T15:30:00.000Z"))).toBe(
      "2026-09-27T15:30:00.000Z",
    );
    expect(() => formatIsoDateTime(new Date("invalid"))).toThrow(InvalidIsoDateTimeError);
  });
});
