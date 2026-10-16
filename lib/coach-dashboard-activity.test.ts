import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  activeIdsFromRpcRows,
  activeIdsFromTaskRows,
  fetchStudentActivity,
  prevWeekFromTaskRows,
  type ActivityWindow,
  type PrevWeekTaskRow,
} from "./coach-dashboard-activity";
import { completionPercent } from "./completion";

const window: ActivityWindow = { recentSince: "2026-10-05T00:00:00.000Z", prevFrom: "2026-09-28", prevTo: "2026-10-04" };

// A verbal-course question task of N questions weighs N x 10 effort units (lib/effort-weight.ts).
const row = (student_id: string, status: string, over: Partial<PrevWeekTaskRow> = {}): PrevWeekTaskRow => ({
  student_id,
  task_date: "2026-10-01",
  task_type: "question_bank",
  course_id: "tyt-turkce",
  title: "x",
  status,
  total_count: 10, // 100 units
  ...over,
});

describe("who was active: from the database function, or (before migration 0134) from the rows", () => {
  it("the function's rows give the set of recently active students", () => {
    const ids = activeIdsFromRpcRows([
      { student_id: "a", recently_active: true, prev_total: 10, prev_done: 3 },
      { student_id: "b", recently_active: false, prev_total: 4, prev_done: 4 },
      { student_id: "c", recently_active: true, prev_total: 0, prev_done: 0 },
    ]);
    expect([...ids].sort()).toEqual(["a", "c"]);
  });

  it("gives the same answer as the row-based derivation", () => {
    const recent = [
      { student_id: "a", updated_at: "2026-10-06T10:00:00.000Z", created_at: "2026-10-01T10:00:00.000Z" },
      // assigned and never opened: updated_at === created_at is not activity
      { student_id: "b", updated_at: "2026-10-06T10:00:00.000Z", created_at: "2026-10-06T10:00:00.000Z" },
    ];
    const fromRpc = activeIdsFromRpcRows([
      { student_id: "a", recently_active: true, prev_total: 2, prev_done: 1 },
      { student_id: "b", recently_active: false, prev_total: 1, prev_done: 0 },
    ]);
    expect([...activeIdsFromTaskRows(recent)]).toEqual([...fromRpc]);
  });
});

describe("last week's completion: the effort-weighted math, not one unit per task", () => {
  it("every task's full weight below, what it earned above (done 100%, half done solved / target, the rest nothing)", () => {
    const prev = prevWeekFromTaskRows([
      row("a", "done"), // 100 / 100
      row("a", "half_done", { total_count: 40, correct_count: 20, wrong_count: 5 }), // 400 / 250
      row("a", "not_done", { correct_count: 5 }), // 100 / 0
      row("a", "pending"), // 100 / 0
      row("b", "done", { total_count: 20 }), // 200 / 200
    ]);
    expect(prev.get("a")).toEqual({ done: 350, total: 700 });
    expect(completionPercent(prev.get("a")!)).toBe(50);
    expect(prev.get("b")).toEqual({ done: 200, total: 200 });
    // one unit per task would have said 1 of 4 = 25%
  });

  it("a student with no task last week has no bucket (so no low-performance entry)", () => {
    expect(prevWeekFromTaskRows([row("a", "done")]).has("c")).toBe(false);
  });

  it("a big task left undone outweighs a small one done", () => {
    const prev = prevWeekFromTaskRows([row("a", "done", { total_count: 5 }), row("a", "pending", { total_count: 50 })]);
    expect(completionPercent(prev.get("a")!)).toBe(9); // 50 of 550
  });
});

describe("fetchStudentActivity", () => {
  // A fake supabase: the function (rpc) and the task rows each answer on their own.
  const fake = (rpcAnswer: unknown, rows: Record<string, unknown>[]) => {
    const rpc = vi.fn().mockResolvedValue(rpcAnswer);
    const from = vi.fn(() => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "gte", "lte", "order", "range"]) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null, count: rows.length });
      return b;
    });
    return { rpc, from };
  };

  it("asks the function once for who is active and reads last week's rows once for the weighted completion", async () => {
    const client = fake({ data: [{ student_id: "a", recently_active: true, prev_total: 2, prev_done: 1 }], error: null }, [
      row("a", "done"),
      row("a", "pending"),
    ]);
    const result = await fetchStudentActivity(client as never, ["a", "b"], window);
    expect(client.rpc).toHaveBeenCalledWith("coach_dashboard_activity", {
      p_student_ids: ["a", "b"],
      p_recent_since: window.recentSince,
      p_prev_from: window.prevFrom,
      p_prev_to: window.prevTo,
    });
    expect(client.from).toHaveBeenCalledTimes(1); // last week's rows only; the recent-activity rows are not read
    expect(result.activeIds.has("a")).toBe(true);
    expect(result.prevWeek.get("a")).toEqual({ done: 100, total: 200 });
  });

  it("before the migration is run (function missing) it reads the recent rows too, with the same result", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = fake({ data: null, error: { message: "function public.coach_dashboard_activity does not exist" } }, [
      { ...row("a", "done"), updated_at: "2026-10-06T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
    ]);
    const result = await fetchStudentActivity(client as never, ["a"], window);
    expect([...result.activeIds]).toEqual(["a"]);
    expect(result.prevWeek.get("a")).toEqual({ done: 100, total: 100 });
  });

  it("with no students it asks nothing", async () => {
    const rpc = vi.fn();
    const result = await fetchStudentActivity({ rpc } as never, [], window);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.activeIds.size).toBe(0);
  });
});

describe("the other places that used to count tasks now use the weighted math", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the coach dashboard's low-performance alert and the notification thresholds are effort-weighted", () => {
    const dash = read("../app/coach/dashboard/page.tsx");
    expect(dash).toContain("completionPercent(b)");
    expect(dash).not.toContain("Math.round((b.done / b.total) * 100)");
    const notifications = read("../app/coach/notifications/page.tsx");
    expect(notifications).toContain("weightedCounts(tasks)");
    expect(notifications).toContain("completionPercent(prevBucket)");
    expect(notifications).toContain("curBucket.done >= curBucket.total");
    expect(notifications).not.toMatch(/b\.total \+= 1/);
  });

  it("the admin's coach page computes the roster's task completion with it", () => {
    const admin = read("../app/admin/coaches/[id]/page.tsx");
    expect(admin).toContain("completionPercent(weightedCounts(rosterTasks))");
    expect(admin).not.toContain("taskCompletionDone");
  });
});

describe("migration 0134", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0134_coach_dashboard_activity.sql", import.meta.url), "utf8");

  it("runs as the caller (row-level security still decides what a coach can count) and is computed live, not cached", () => {
    expect(sql).toContain("security invoker");
    expect(sql).not.toMatch(/security definer/);
    expect(sql).toContain("create or replace function public.coach_dashboard_activity(");
    expect(sql).toContain("grant execute on function public.coach_dashboard_activity(uuid[], timestamptz, date, date) to authenticated;");
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });

  it("keeps both rules: a never-opened task (updated_at = created_at) is not activity; 'done' is the only completed status", () => {
    expect(sql).toContain("t.updated_at <> t.created_at");
    expect(sql).toContain("t.updated_at >= p_recent_since");
    expect(sql).toContain("count(*) filter (where t.status = 'done')");
    expect(sql).toContain("t.task_date >= p_prev_from");
    expect(sql).toContain("t.task_date <= p_prev_to");
  });
});

describe("the refresh cadences decided on 2026-10-08", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the parent's auto refresh is 60 s, only while the tab is visible, and not twice in quick succession", () => {
    const src = read("../components/auto-refresh.tsx");
    expect(src).toContain("intervalMs = 60_000");
    expect(src).toContain('document.visibilityState !== "visible"');
    expect(src).toContain("MIN_GAP_MS");
  });

  it("the student stopwatch widget polls through the visible-only interval, and the poll only reads", () => {
    const widget = read("../app/student/_components/stopwatch/stopwatch-widget.tsx");
    expect(widget).toContain("useVisibleInterval(load, POLL_INTERVAL_MS, onStudentPage)");
    expect(widget).not.toMatch(/setInterval\(load/);
    // getRunningFocusSessions (the polled action) never writes
    const actions = read("../app/student/actions.ts");
    const start = actions.indexOf("export async function getRunningFocusSessions");
    const body = actions.slice(start, actions.indexOf("\n}\n", start));
    expect(body).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
