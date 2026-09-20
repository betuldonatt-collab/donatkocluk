import { describe, expect, it } from "vitest";
import { formatTimerClock, formatTimerTitle } from "./focus-title";

describe("formatTimerClock", () => {
  it("uses mm:ss under an hour and hh:mm:ss from one hour", () => {
    expect(formatTimerClock(0)).toBe("00:00");
    expect(formatTimerClock(65)).toBe("01:05");
    expect(formatTimerClock(3600)).toBe("01:00:00");
    expect(formatTimerClock(1 * 3600 + 25 * 60 + 30)).toBe("01:25:30");
    expect(formatTimerClock(14 * 3600 + 2 * 60 + 9)).toBe("14:02:09");
  });

  it("floors fractions and clamps negatives", () => {
    expect(formatTimerClock(59.9)).toBe("00:59");
    expect(formatTimerClock(-5)).toBe("00:00");
  });
});

describe("formatTimerTitle", () => {
  it("shows the hourglass and the clock", () => {
    expect(formatTimerTitle(1 * 3600 + 25 * 60 + 30)).toBe("⏳ 01:25:30");
  });

  it("switches to the check-in wording while the prompt is waiting", () => {
    expect(formatTimerTitle(3 * 3600 + 5, true)).toBe("⏰ Hâlâ çalışıyor musun? 03:00:05");
  });
});
