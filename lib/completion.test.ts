import { describe, expect, it } from "vitest";
import { closedCycleCounts, completionPercent, resolveCycles, tasksInCycle } from "./completion";

const WED = "2026-09-23";

const task = (task_date: string, status: string) => ({ task_date, status });

describe("resolveCycles", () => {
  it("locked: starts ON the lock's own day (a same-day session plus new same-day tasks must land in the new cycle), previous ends the day before", () => {
    const { current, previous } = resolveCycles({ period_start: "2026-09-08", locked_at: "2026-09-22T08:30:00Z" }, null, WED);
    expect(current).toEqual({ start: "2026-09-22", end: WED });
    expect(previous).toEqual({ start: "2026-09-08", end: "2026-09-21" });
  });

  it("locked: uses only the date part of the lock timestamp", () => {
    expect(resolveCycles({ period_start: "2026-09-01", locked_at: "2026-09-23T23:59:59Z" }, null, WED).current.start).toBe("2026-09-23");
  });

  it("no lock yet: anchors on the upcoming pending session, exactly 7 and 14 days back -- regardless of any completed session, task, or account date", () => {
    const { current, previous } = resolveCycles(null, "2026-09-23T10:00:00Z", WED);
    expect(current).toEqual({ start: "2026-09-16", end: "2026-09-23" });
    expect(previous).toEqual({ start: "2026-09-09", end: "2026-09-16" });
  });

  it("no lock, no pending session either: falls back to today as the anchor", () => {
    const { current, previous } = resolveCycles(null, null, WED);
    expect(current).toEqual({ start: "2026-09-16", end: WED });
    expect(previous).toEqual({ start: "2026-09-09", end: "2026-09-16" });
  });

  it("a same-3rd-Wednesday example -- current is 2nd-to-3rd Wednesday, previous is 1st-to-2nd", () => {
    const thirdWednesday = "2026-09-23";
    const { current, previous } = resolveCycles(null, `${thirdWednesday}T09:00:00Z`, thirdWednesday);
    expect(current).toEqual({ start: "2026-09-16", end: "2026-09-23" }); // 2nd -> 3rd Wednesday
    expect(previous).toEqual({ start: "2026-09-09", end: "2026-09-16" }); // 1st -> 2nd Wednesday
  });
});

describe("tasksInCycle / closedCycleCounts / completionPercent", () => {
  it("counts everything inside the window, future days included -- no due-so-far capping", () => {
    const tasks = [
      task("2026-09-21", "done"),
      task("2026-09-22", "done"),
      task("2026-09-23", "done"),
      task("2026-09-24", "pending"),
      task("2026-09-27", "pending"),
    ];
    const window = { start: "2026-09-21", end: "2026-09-27" };
    expect(tasksInCycle(tasks, window)).toHaveLength(5);
    const counts = closedCycleCounts(tasks, window);
    expect(counts).toEqual({ done: 3, total: 5 });
    expect(completionPercent(counts)).toBe(60);
  });

  it("counts a past task that was not done or left untouched against the student", () => {
    const tasks = [task("2026-09-21", "done"), task("2026-09-22", "not_done"), task("2026-09-23", "pending"), task("2026-09-24", "done")];
    const window = { start: "2026-09-21", end: "2026-09-23" };
    expect(closedCycleCounts(tasks, window)).toEqual({ done: 1, total: 3 }); // the 24th is outside the window
    expect(completionPercent(closedCycleCounts(tasks, window))).toBe(33);
  });

  it("counts only 'done', not half done", () => {
    const window = { start: "2026-09-21", end: "2026-09-22" };
    expect(closedCycleCounts([task("2026-09-21", "half_done"), task("2026-09-22", "done")], window)).toEqual({ done: 1, total: 2 });
  });

  it("is null when the window had no tasks at all", () => {
    expect(completionPercent(closedCycleCounts([], { start: "2026-09-08", end: "2026-09-22" }))).toBeNull();
  });

  it("a same-day session: a task the coach assigns for today, right after locking, lands in the NEW cycle, not the one just closed", () => {
    // Coach locks at 10:00 on the 23rd (closing the cycle that started the
    // 15th) and, in the same sitting, assigns a fresh task for the 23rd.
    const { current, previous } = resolveCycles({ period_start: "2026-09-15", locked_at: "2026-09-23T10:00:00Z" }, null, WED);
    const newTaskAssignedRightAfterLocking = task("2026-09-23", "pending");
    expect(closedCycleCounts([newTaskAssignedRightAfterLocking], current).total).toBe(1);
    expect(newTaskAssignedRightAfterLocking.task_date > previous.end).toBe(true);
  });
});
