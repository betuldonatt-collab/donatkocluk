import { describe, expect, it } from "vitest";

import { resolveCycles } from "./completion";
import { groupStudentsByCycleWindow } from "./cycle-query-groups";
import { weightedCycleCounts, type WeightableTask } from "./effort-weight";

describe("groupStudentsByCycleWindow", () => {
  it("puts students with the same window in one group and keeps every student exactly once", () => {
    const windows: Record<string, { start: string; end: string }> = {
      a: { start: "2026-10-01", end: "2026-10-08" },
      b: { start: "2026-10-01", end: "2026-10-08" },
      c: { start: "2026-09-24", end: "2026-10-08" },
      d: { start: "2026-10-01", end: "2026-10-08" },
    };
    const groups = groupStudentsByCycleWindow(["a", "b", "c", "d"], (id) => windows[id]);
    expect(groups).toEqual([
      { start: "2026-10-01", end: "2026-10-08", studentIds: ["a", "b", "d"] },
      { start: "2026-09-24", end: "2026-10-08", studentIds: ["c"] },
    ]);
  });

  it("is empty for an empty roster", () => {
    expect(groupStudentsByCycleWindow([], () => ({ start: "2026-10-01", end: "2026-10-08" }))).toEqual([]);
  });

  // The roster page now reads only each student's current window instead of their whole history; the percentage it
  // computes from those rows must equal the one computed from the full history.
  it("a window-bounded read gives the same completion counts as the full history", () => {
    const all: WeightableTask[] = [
      ["2026-08-01", "done"],
      ["2026-09-20", "not_done"],
      ["2026-10-02", "done"],
      ["2026-10-03", "pending"],
      ["2026-10-08", "done"],
      ["2026-10-20", "pending"],
    ].map(([task_date, status]) => ({ task_date, status, task_type: "question_bank", course_id: "tyt-matematik", title: "t", total_count: 20, duration_minutes: null }));
    const { current } = resolveCycles({ period_start: "2026-09-24", locked_at: "2026-10-01T09:00:00Z" }, null, "2026-10-08");
    const bounded = all.filter((t) => t.task_date >= current.start && t.task_date <= current.end);
    expect(weightedCycleCounts(bounded, current)).toEqual(weightedCycleCounts(all, current));
    expect(bounded.length).toBeLessThan(all.length);
  });
});
