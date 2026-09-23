import { describe, expect, it } from "vitest";
import { completionCounts, completionPercent, completionStart, tasksDueSoFar, weekCompletionCounts } from "./completion";

// 2026-09-23 is a Wednesday; its week runs Mon 2026-09-21 .. Sun 2026-09-27.
const WED = "2026-09-23";

const task = (task_date: string, status: string) => ({ task_date, status });

describe("tasksDueSoFar", () => {
  it("keeps this week's Monday through today and drops the future", () => {
    const tasks = [
      task("2026-09-21", "done"), // Mon
      task("2026-09-23", "pending"), // today
      task("2026-09-24", "pending"), // tomorrow -- not counted
      task("2026-09-27", "pending"), // Sunday -- not counted
    ];
    expect(tasksDueSoFar(tasks, WED).map((t) => t.task_date)).toEqual(["2026-09-21", "2026-09-23"]);
  });

  it("ignores earlier weeks", () => {
    expect(tasksDueSoFar([task("2026-09-20", "done"), task("2026-09-14", "done")], WED)).toEqual([]);
  });
});

describe("completionCounts / completionPercent", () => {
  it("is 100% when everything due up to today is done, ignoring the rest of the week", () => {
    const tasks = [
      task("2026-09-21", "done"),
      task("2026-09-22", "done"),
      task("2026-09-23", "done"),
      task("2026-09-24", "pending"),
      task("2026-09-25", "pending"),
      task("2026-09-26", "pending"),
      task("2026-09-27", "pending"),
    ];
    const counts = completionCounts(tasks, WED);
    expect(counts).toEqual({ done: 3, total: 3 });
    expect(completionPercent(counts)).toBe(100);
  });

  it("counts a past task that was not done or left untouched against the student", () => {
    const tasks = [task("2026-09-21", "done"), task("2026-09-22", "not_done"), task("2026-09-23", "pending"), task("2026-09-24", "done")];
    expect(completionCounts(tasks, WED)).toEqual({ done: 1, total: 3 }); // tomorrow's "done" is not counted either
    expect(completionPercent(completionCounts(tasks, WED))).toBe(33);
  });

  it("counts only 'done', not half done", () => {
    const counts = completionCounts([task("2026-09-21", "half_done"), task("2026-09-22", "done")], WED);
    expect(counts).toEqual({ done: 1, total: 2 });
  });

  it("is null when nothing is due yet (e.g. the program starts later in the week)", () => {
    const counts = completionCounts([task("2026-09-25", "pending")], WED);
    expect(counts).toEqual({ done: 0, total: 0 });
    expect(completionPercent(counts)).toBeNull();
  });

  it("on Monday, today's finished tasks alone already read 100%", () => {
    const tasks = [task("2026-09-21", "done"), task("2026-09-22", "pending"), task("2026-09-23", "pending")];
    expect(completionPercent(completionCounts(tasks, "2026-09-21"))).toBe(100);
  });

  it("on Sunday the whole week counts", () => {
    const tasks = [task("2026-09-21", "done"), task("2026-09-27", "pending")];
    expect(completionPercent(completionCounts(tasks, "2026-09-27"))).toBe(50);
  });
});

describe("lock-day start", () => {
  it("starts on the day the week was locked instead of Monday", () => {
    expect(completionStart(WED, "2026-09-22T08:30:00Z")).toBe("2026-09-22");
    const tasks = [task("2026-09-21", "not_done"), task("2026-09-22", "done"), task("2026-09-23", "done"), task("2026-09-24", "pending")];
    // Monday's missed task is before the lock day: not counted.
    expect(completionCounts(tasks, WED, "2026-09-22T08:30:00Z")).toEqual({ done: 2, total: 2 });
    expect(completionPercent(completionCounts(tasks, WED, "2026-09-22T08:30:00Z"))).toBe(100);
  });

  it("uses only the date part of the lock timestamp", () => {
    expect(completionStart(WED, "2026-09-23T23:59:59Z")).toBe("2026-09-23");
    expect(completionStart(WED, "2026-09-23")).toBe("2026-09-23");
  });

  it("falls back to Monday when the week is not locked", () => {
    expect(completionStart(WED, null)).toBe("2026-09-21");
    expect(completionStart(WED, undefined)).toBe("2026-09-21");
  });

  it("never starts before the week itself (a lock from the Sunday before)", () => {
    expect(completionStart(WED, "2026-09-20T18:00:00Z")).toBe("2026-09-21");
  });

  it("locked today: only today's tasks are due", () => {
    const tasks = [task("2026-09-21", "not_done"), task("2026-09-23", "done"), task("2026-09-24", "pending")];
    expect(completionCounts(tasks, WED, "2026-09-23T06:00:00Z")).toEqual({ done: 1, total: 1 });
  });

  it("is null when nothing lies between the lock day and today", () => {
    expect(completionPercent(completionCounts([task("2026-09-24", "pending")], WED, "2026-09-23T06:00:00Z"))).toBeNull();
  });
});

describe("weekCompletionCounts (the 'Bu Hafta' macro view)", () => {
  it("counts the WHOLE week, future days included in the denominator from day one", () => {
    const tasks = [
      task("2026-09-21", "done"), // Mon
      task("2026-09-22", "done"),
      task("2026-09-23", "done"), // today
      task("2026-09-24", "pending"), // tomorrow -- IS counted (unlike completionCounts)
      task("2026-09-25", "pending"),
      task("2026-09-26", "pending"),
      task("2026-09-27", "pending"), // Sun
    ];
    // Contrast with completionCounts on the exact same data: that one reads
    // 100% (3/3, future excluded) -- this one reads the true whole-week state.
    expect(completionCounts(tasks, WED)).toEqual({ done: 3, total: 3 });
    expect(weekCompletionCounts(tasks, WED)).toEqual({ done: 3, total: 7 });
    expect(completionPercent(weekCompletionCounts(tasks, WED))).toBe(43);
  });

  it("the total is fixed for the week -- finishing a future task moves done, never total", () => {
    const total = weekCompletionCounts(
      [task("2026-09-21", "done"), task("2026-09-24", "pending"), task("2026-09-27", "pending")],
      WED,
    ).total;
    const afterFinishingTomorrow = weekCompletionCounts(
      [task("2026-09-21", "done"), task("2026-09-24", "done"), task("2026-09-27", "pending")],
      WED,
    );
    expect(afterFinishingTomorrow.total).toBe(total);
    expect(afterFinishingTomorrow.done).toBe(2);
  });

  it("still respects the lock day as the start, same as the micro view", () => {
    const tasks = [task("2026-09-21", "not_done"), task("2026-09-22", "done"), task("2026-09-27", "pending")];
    // Monday is before the Tuesday lock day, so it's excluded even though
    // it's within the calendar week.
    expect(weekCompletionCounts(tasks, WED, "2026-09-22T08:30:00Z")).toEqual({ done: 1, total: 2 });
  });

  it("ignores earlier weeks, same as tasksDueSoFar", () => {
    expect(weekCompletionCounts([task("2026-09-14", "done"), task("2026-09-20", "done")], WED)).toEqual({
      done: 0,
      total: 0,
    });
  });

  it("is null only when the whole week has no tasks at all", () => {
    expect(completionPercent(weekCompletionCounts([], WED))).toBeNull();
  });
});
