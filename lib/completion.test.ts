import { describe, expect, it } from "vitest";
import { closedCycleCounts, completionCounts, completionPercent, resolveCycles, tasksDueSoFar } from "./completion";

const WED = "2026-09-23";

const task = (task_date: string, status: string) => ({ task_date, status });

describe("resolveCycles", () => {
  it("starts the day after the last lock, and the previous cycle is exactly what that lock closed", () => {
    const { currentStart, previousCycle } = resolveCycles({ period_start: "2026-09-08", locked_at: "2026-09-22T08:30:00Z" }, null);
    expect(currentStart).toBe("2026-09-23");
    expect(previousCycle).toEqual({ start: "2026-09-08", end: "2026-09-22" });
  });

  it("uses only the date part of the lock timestamp", () => {
    expect(resolveCycles({ period_start: "2026-09-01", locked_at: "2026-09-23T23:59:59Z" }, null).currentStart).toBe("2026-09-24");
  });

  it("falls back to the first completed session when there is no lock yet", () => {
    const { currentStart, previousCycle } = resolveCycles(null, "2026-09-10T12:00:00Z");
    expect(currentStart).toBe("2026-09-10");
    expect(previousCycle).toBeNull();
  });

  it("has no window at all when there is neither a lock nor a completed session", () => {
    expect(resolveCycles(null, null)).toEqual({ currentStart: null, previousCycle: null });
  });
});

describe("tasksDueSoFar", () => {
  it("keeps the cycle start through today and drops the future", () => {
    const tasks = [
      task("2026-09-21", "done"),
      task("2026-09-23", "pending"), // today
      task("2026-09-24", "pending"), // tomorrow -- not counted
      task("2026-09-27", "pending"), // not counted
    ];
    expect(tasksDueSoFar(tasks, WED, "2026-09-21").map((t) => t.task_date)).toEqual(["2026-09-21", "2026-09-23"]);
  });

  it("ignores anything before the cycle start", () => {
    expect(tasksDueSoFar([task("2026-09-20", "done"), task("2026-09-14", "done")], WED, "2026-09-21")).toEqual([]);
  });

  it("is always empty when there is no cycle start yet", () => {
    expect(tasksDueSoFar([task("2026-09-23", "done")], WED, null)).toEqual([]);
  });
});

describe("completionCounts / completionPercent", () => {
  it("is 100% when everything due so far is done, ignoring the future", () => {
    const tasks = [
      task("2026-09-21", "done"),
      task("2026-09-22", "done"),
      task("2026-09-23", "done"),
      task("2026-09-24", "pending"),
      task("2026-09-27", "pending"),
    ];
    const counts = completionCounts(tasks, WED, "2026-09-21");
    expect(counts).toEqual({ done: 3, total: 3 });
    expect(completionPercent(counts)).toBe(100);
  });

  it("counts a past task that was not done or left untouched against the student", () => {
    const tasks = [task("2026-09-21", "done"), task("2026-09-22", "not_done"), task("2026-09-23", "pending"), task("2026-09-24", "done")];
    expect(completionCounts(tasks, WED, "2026-09-21")).toEqual({ done: 1, total: 3 }); // tomorrow's "done" is not counted either
    expect(completionPercent(completionCounts(tasks, WED, "2026-09-21"))).toBe(33);
  });

  it("counts only 'done', not half done", () => {
    const counts = completionCounts([task("2026-09-21", "half_done"), task("2026-09-22", "done")], WED, "2026-09-21");
    expect(counts).toEqual({ done: 1, total: 2 });
  });

  it("is null when nothing is due yet", () => {
    expect(completionPercent(completionCounts([task("2026-09-25", "pending")], WED, "2026-09-21"))).toBeNull();
  });

  it("is null (never 0%/100%) when there is no cycle start at all", () => {
    const counts = completionCounts([task("2026-09-23", "done")], WED, null);
    expect(counts).toEqual({ done: 0, total: 0 });
    expect(completionPercent(counts)).toBeNull();
  });

  it("starting on the lock day itself: only today's tasks are due", () => {
    const tasks = [task("2026-09-21", "not_done"), task("2026-09-23", "done"), task("2026-09-24", "pending")];
    expect(completionCounts(tasks, WED, "2026-09-23")).toEqual({ done: 1, total: 1 });
  });
});

describe("closedCycleCounts (the previous-cycle comparison bar)", () => {
  it("counts every task in the fixed [start, end] range, no future-day exclusion needed", () => {
    const tasks = [
      task("2026-09-08", "done"),
      task("2026-09-10", "not_done"),
      task("2026-09-15", "done"),
      task("2026-09-22", "pending"), // last day of the closed cycle
      task("2026-09-23", "done"), // belongs to the NEXT cycle -- excluded
    ];
    expect(closedCycleCounts(tasks, "2026-09-08", "2026-09-22")).toEqual({ done: 2, total: 4 });
    expect(completionPercent(closedCycleCounts(tasks, "2026-09-08", "2026-09-22"))).toBe(50);
  });

  it("is null when the closed cycle had no tasks at all", () => {
    expect(completionPercent(closedCycleCounts([], "2026-09-08", "2026-09-22"))).toBeNull();
  });
});
