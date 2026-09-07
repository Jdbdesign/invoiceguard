import { describe, expect, it } from "vitest";
import { fromIsoDate, toIsoDate } from "./dateSerialization";

describe("toIsoDate / fromIsoDate", () => {
  it("round-trips a date through both directions", () => {
    const iso = "2026-03-14";
    expect(toIsoDate(fromIsoDate(iso))).toBe(iso);
  });

  it("stores at UTC midnight regardless of local time zone offset", () => {
    const date = fromIsoDate("2026-01-01");
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });

  it("pads single-digit months and days", () => {
    const date = new Date(Date.UTC(2026, 0, 5)); // Jan 5
    expect(toIsoDate(date)).toBe("2026-01-05");
  });
});
