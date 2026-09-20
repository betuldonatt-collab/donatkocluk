import { describe, expect, it } from "vitest";
import {
  FOCUS_APPROVAL_THRESHOLD_SECONDS,
  creditedSecondsFromMinutes,
  formatFocusDuration,
  needsCoachApproval,
} from "./focus-approval";

describe("needsCoachApproval", () => {
  it("is exactly 6 hours and only STRICTLY above it flags", () => {
    expect(FOCUS_APPROVAL_THRESHOLD_SECONDS).toBe(21600);
    expect(needsCoachApproval(21600)).toBe(false);
    expect(needsCoachApproval(21601)).toBe(true);
    expect(needsCoachApproval(3 * 3600)).toBe(false);
    expect(needsCoachApproval(14 * 3600)).toBe(true);
  });
});

describe("formatFocusDuration", () => {
  it("formats hours and minutes in Turkish abbreviations", () => {
    expect(formatFocusDuration(14 * 3600 + 12 * 60)).toBe("14 sa 12 dk");
    expect(formatFocusDuration(45 * 60)).toBe("45 dk");
    expect(formatFocusDuration(3 * 3600)).toBe("3 sa");
  });
});

describe("creditedSecondsFromMinutes", () => {
  const recorded = 14 * 3600;

  it("accepts a reduced whole number of minutes", () => {
    expect(creditedSecondsFromMinutes(180, recorded)).toBe(180 * 60);
    expect(creditedSecondsFromMinutes(840, recorded)).toBe(recorded); // exactly as recorded
  });

  it("rejects more than was recorded (a coach can cut, never inflate)", () => {
    expect(creditedSecondsFromMinutes(841, recorded)).toBeNull();
  });

  it("rejects zero, negatives, decimals and NaN", () => {
    for (const bad of [0, -5, 2.5, Number.NaN]) expect(creditedSecondsFromMinutes(bad, recorded)).toBeNull();
  });
});
