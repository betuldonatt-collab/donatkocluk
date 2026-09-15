import { describe, expect, it } from "vitest";
import { mondayOf, stopwatchLogicalDateIso, weekDates } from "./date";

// 2024-01-01 is a known Monday; 2025-01-01 is a known Wednesday (2024 is a
// leap year, 366 % 7 === 2) -- used throughout as fixed reference points
// rather than re-deriving weekdays from scratch.
describe("mondayOf", () => {
  it("returns the same date when it's already a Monday", () => {
    expect(mondayOf("2024-01-01")).toBe("2024-01-01");
  });

  it("returns the preceding Monday for a mid-week date", () => {
    expect(mondayOf("2024-01-04")).toBe("2024-01-01"); // Thursday
  });

  it("handles Sunday correctly -- the dow===0 special case", () => {
    expect(mondayOf("2024-01-07")).toBe("2024-01-01"); // Sunday, same week as the Monday above
  });

  it("rolls over correctly into the next week's Monday", () => {
    expect(mondayOf("2024-01-08")).toBe("2024-01-08"); // the following Monday
  });

  it("rolls over a year boundary correctly", () => {
    expect(mondayOf("2025-01-01")).toBe("2024-12-30"); // Wednesday -> the Monday in the prior year
  });
});

// The boundary is UTC 23:00 (= 02:00 Turkey time) -- these use explicit
// UTC instants rather than the local Date() constructor so the test
// itself doesn't depend on the machine running it being in any
// particular timezone.
describe("stopwatchLogicalDateIso", () => {
  it("is unchanged just before the boundary", () => {
    expect(stopwatchLogicalDateIso(new Date("2024-01-04T22:59:00Z"))).toBe("2024-01-04");
  });

  it("advances to the next day right at the boundary", () => {
    expect(stopwatchLogicalDateIso(new Date("2024-01-04T23:00:00Z"))).toBe("2024-01-05");
  });

  it("stays on the next day just after the boundary", () => {
    expect(stopwatchLogicalDateIso(new Date("2024-01-04T23:01:00Z"))).toBe("2024-01-05");
  });

  it("is unchanged during the middle of the day", () => {
    expect(stopwatchLogicalDateIso(new Date("2024-01-04T12:00:00Z"))).toBe("2024-01-04");
  });

  it("rolls over a year boundary correctly", () => {
    expect(stopwatchLogicalDateIso(new Date("2024-12-31T23:30:00Z"))).toBe("2025-01-01");
  });
});

describe("weekDates", () => {
  it("returns 7 consecutive ISO dates, Monday through Sunday", () => {
    expect(weekDates("2024-01-04")).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
      "2024-01-04",
      "2024-01-05",
      "2024-01-06",
      "2024-01-07",
    ]);
  });

  it("is stable regardless of which day of that week is passed in", () => {
    const fromMonday = weekDates("2024-01-01");
    const fromSunday = weekDates("2024-01-07");
    expect(fromMonday).toEqual(fromSunday);
  });

  it("spans a year boundary as 7 consecutive dates", () => {
    expect(weekDates("2025-01-01")).toEqual([
      "2024-12-30",
      "2024-12-31",
      "2025-01-01",
      "2025-01-02",
      "2025-01-03",
      "2025-01-04",
      "2025-01-05",
    ]);
  });
});
