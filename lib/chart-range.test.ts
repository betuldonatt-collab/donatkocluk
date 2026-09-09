import { describe, expect, it } from "vitest";
import { dateToISO, formatChartRangeLabel, isDateInChartRange, isoToDate, isValidISODateOnly, LAST_30_DAYS_RANGE } from "./chart-range";

const NOW = new Date("2026-09-05T12:00:00Z");

describe("isDateInChartRange", () => {
  it("includes today for the last-30-days range", () => {
    expect(isDateInChartRange("2026-09-05", LAST_30_DAYS_RANGE, NOW)).toBe(true);
  });

  it("includes exactly 29 days back for the last-30-days range", () => {
    expect(isDateInChartRange("2026-08-07", LAST_30_DAYS_RANGE, NOW)).toBe(true);
  });

  it("excludes 30 days back (one day outside the window)", () => {
    expect(isDateInChartRange("2026-08-06", LAST_30_DAYS_RANGE, NOW)).toBe(false);
  });

  it("excludes a future date for the last-30-days range", () => {
    expect(isDateInChartRange("2026-09-06", LAST_30_DAYS_RANGE, NOW)).toBe(false);
  });

  it("includes a date within a custom range, inclusive of both endpoints", () => {
    const range = { type: "custom" as const, startDate: "2026-08-01", endDate: "2026-08-31" };
    expect(isDateInChartRange("2026-08-01", range)).toBe(true);
    expect(isDateInChartRange("2026-08-31", range)).toBe(true);
    expect(isDateInChartRange("2026-08-15", range)).toBe(true);
  });

  it("excludes a date outside a custom range", () => {
    const range = { type: "custom" as const, startDate: "2026-08-01", endDate: "2026-08-31" };
    expect(isDateInChartRange("2026-07-31", range)).toBe(false);
    expect(isDateInChartRange("2026-09-01", range)).toBe(false);
  });
});

describe("dateToISO / isoToDate", () => {
  it("round-trips without a timezone shift", () => {
    const d = new Date(2026, 7, 15); // 15 Ağustos 2026, local time
    expect(dateToISO(d)).toBe("2026-08-15");
    expect(isoToDate("2026-08-15").getFullYear()).toBe(2026);
    expect(isoToDate("2026-08-15").getMonth()).toBe(7);
    expect(isoToDate("2026-08-15").getDate()).toBe(15);
  });
});

describe("isValidISODateOnly", () => {
  it("accepts a real calendar date", () => {
    expect(isValidISODateOnly("2026-08-15")).toBe(true);
  });

  it("accepts the last day of a leap-year February", () => {
    expect(isValidISODateOnly("2028-02-29")).toBe(true);
  });

  it("rejects a non-leap-year Feb 29", () => {
    expect(isValidISODateOnly("2026-02-29")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidISODateOnly("2026-13-01")).toBe(false);
  });

  it("rejects an out-of-range day", () => {
    expect(isValidISODateOnly("2026-04-31")).toBe(false);
  });

  it("rejects a value that doesn't match the YYYY-MM-DD shape at all", () => {
    expect(isValidISODateOnly("2026/08/15")).toBe(false);
    expect(isValidISODateOnly("2026-08-15T00:00:00Z")).toBe(false);
    expect(isValidISODateOnly("not-a-date")).toBe(false);
    expect(isValidISODateOnly("")).toBe(false);
  });
});

describe("formatChartRangeLabel", () => {
  it("labels the last-30-days range", () => {
    expect(formatChartRangeLabel(LAST_30_DAYS_RANGE)).toBe("Son 30 Gün");
  });

  it("labels a custom range within the same year without repeating it", () => {
    const label = formatChartRangeLabel({ type: "custom", startDate: "2026-08-15", endDate: "2026-09-01" });
    expect(label).toBe("15 Ağu – 01 Eyl 2026");
  });

  it("labels a custom range spanning a year boundary with both years shown", () => {
    const label = formatChartRangeLabel({ type: "custom", startDate: "2025-12-20", endDate: "2026-01-05" });
    expect(label).toBe("20 Ara 2025 – 05 Oca 2026");
  });
});
