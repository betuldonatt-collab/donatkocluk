import { describe, expect, it } from "vitest";
import { mondayOf, weekDates } from "./date";

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
