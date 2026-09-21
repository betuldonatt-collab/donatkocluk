import { describe, expect, it } from "vitest";
import { completionCounts, completionPercent, tasksDueSoFar } from "./completion";

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
