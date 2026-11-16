import { describe, expect, it } from "vitest";

import { addDaysISO, isTaskFrozen, lockBoundary, lockScopeEnd, planLock } from "./progress-lock-scope";

const TODAY = "2026-11-16"; // a Monday

describe("lockBoundary", () => {
  it("is the day after the viewed week's last day, never later than today", () => {
    expect(lockBoundary(TODAY, "2026-11-08")).toBe("2026-11-09"); // last week (Mon 2-Sun 8): the lock day is the 9th
    expect(lockBoundary(TODAY, "2026-11-15")).toBe("2026-11-16"); // yesterday's Sunday -> today
    expect(lockBoundary(TODAY, "2026-11-22")).toBe(TODAY); // the current week ends in the future -> today
    expect(lockBoundary(TODAY, "2027-03-01")).toBe(TODAY);
  });
  it("no viewed week = today", () => {
    expect(lockBoundary(TODAY)).toBe(TODAY);
    expect(lockBoundary(TODAY, null)).toBe(TODAY);
  });
});

describe("what a lock freezes (the same comparison the database and the screens make)", () => {
  it("everything strictly before the lock day, nothing from it on -- future days are never frozen", () => {
    for (const through of ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2027-01-01"]) {
      const boundary = lockBoundary(TODAY, through);
      expect(isTaskFrozen(TODAY, boundary), through).toBe(false);
      for (let i = 0; i < 90; i++) expect(isTaskFrozen(addDaysISO(TODAY, i), boundary), `${through} +${i}`).toBe(false);
    }
  });

  it("locking last week freezes last week and earlier, and leaves the weeks after it (up to today and beyond) open", () => {
    const boundary = lockBoundary(TODAY, "2026-11-08");
    expect(isTaskFrozen("2026-11-08", boundary)).toBe(true); // the viewed week's last day
    expect(isTaskFrozen("2026-11-02", boundary)).toBe(true);
    expect(isTaskFrozen("2026-10-01", boundary)).toBe(true); // earlier weeks
    expect(isTaskFrozen("2026-11-09", boundary)).toBe(false); // the week after the viewed one stays editable
    expect(isTaskFrozen("2026-11-12", boundary)).toBe(false);
    expect(isTaskFrozen(TODAY, boundary)).toBe(false);
  });

  it("never locked = nothing frozen", () => {
    expect(isTaskFrozen("2020-01-01", null)).toBe(false);
  });
});

describe("planLock", () => {
  it("a first lock of an older week: backdated, the cycle starts 7 days before the boundary, finalize runs up to the viewed week's end", () => {
    const r = planLock({ today: TODAY, throughDate: "2026-11-08", lastLockDay: null });
    expect(r).toEqual({
      ok: true,
      plan: { boundary: "2026-11-09", periodStart: "2026-11-02", finalizeFrom: "2026-11-02", finalizeTo: "2026-11-08", backdated: true },
    });
  });

  it("a lock reaching today is not backdated and finalizes through yesterday, exactly as before", () => {
    const r = planLock({ today: TODAY, throughDate: "2026-11-22", lastLockDay: "2026-11-01" });
    expect(r).toEqual({
      ok: true,
      plan: { boundary: TODAY, periodStart: "2026-11-01", finalizeFrom: "2026-11-01", finalizeTo: "2026-11-15", backdated: false },
    });
  });

  it("the cycle always starts before its boundary (the database check)", () => {
    for (const through of ["2026-10-04", "2026-11-08", "2026-11-15", "2026-12-01"]) {
      const r = planLock({ today: TODAY, throughDate: through, lastLockDay: null });
      expect(r.ok && r.plan.periodStart < r.plan.boundary, through).toBe(true);
    }
  });

  it("refuses a lock that would not move the boundary forward", () => {
    const sameDay = planLock({ today: TODAY, throughDate: "2026-11-22", lastLockDay: TODAY });
    expect(sameDay).toEqual({ ok: false, error: "Program bugün zaten kilitlendi." });
    const older = planLock({ today: TODAY, throughDate: "2026-11-01", lastLockDay: "2026-11-09" });
    expect(older.ok).toBe(false);
    expect(older.ok === false && older.error).toContain("09.11.2026");
    const exactlyAtLock = planLock({ today: TODAY, throughDate: "2026-11-08", lastLockDay: "2026-11-09" });
    expect(exactlyAtLock.ok).toBe(false);
  });

  it("refuses a malformed date", () => {
    expect(planLock({ today: TODAY, throughDate: "16/11/2026", lastLockDay: null })).toEqual({ ok: false, error: "Geçersiz tarih." });
  });
});

describe("lockScopeEnd (the last day named in the confirmation)", () => {
  it("is the viewed week's last day for a past week, yesterday for any window that reaches today", () => {
    expect(lockScopeEnd("2026-11-08", TODAY)).toBe("2026-11-08");
    expect(lockScopeEnd("2026-11-22", TODAY)).toBe("2026-11-15");
    expect(lockScopeEnd("2026-11-15", TODAY)).toBe("2026-11-15");
  });
});
