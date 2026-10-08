import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { activityFromRpcRows, activityFromTaskRows, fetchStudentActivity, type ActivityWindow } from "./coach-dashboard-activity";

const window: ActivityWindow = { recentSince: "2026-10-05T00:00:00.000Z", prevFrom: "2026-09-28", prevTo: "2026-10-04" };

describe("the dashboard's activity numbers, from the database function", () => {
  it("turns one row per student into the active set and last week's done/total", () => {
    const { activeIds, prevWeek } = activityFromRpcRows([
      { student_id: "a", recently_active: true, prev_total: 10, prev_done: 3 },
      { student_id: "b", recently_active: false, prev_total: 4, prev_done: 4 },
      { student_id: "c", recently_active: true, prev_total: 0, prev_done: 0 },
    ]);
    expect([...activeIds].sort()).toEqual(["a", "c"]);
    expect(prevWeek.get("a")).toEqual({ done: 3, total: 10 });
    expect(prevWeek.get("b")).toEqual({ done: 4, total: 4 });
    // a student with no task last week has no bucket (so no "low performance" entry), exactly as before
    expect(prevWeek.has("c")).toBe(false);
  });

  it("gives the same answer as the row-based derivation it replaces", () => {
    const recent = [
      { student_id: "a", updated_at: "2026-10-06T10:00:00.000Z", created_at: "2026-10-01T10:00:00.000Z" },
      // assigned and never opened: updated_at === created_at is not activity
      { student_id: "b", updated_at: "2026-10-06T10:00:00.000Z", created_at: "2026-10-06T10:00:00.000Z" },
    ];
    const prev = [
      { student_id: "a", status: "done" },
      { student_id: "a", status: "pending" },
      { student_id: "b", status: "not_done" },
    ];
    const fromRows = activityFromTaskRows(recent, prev);
    const fromRpc = activityFromRpcRows([
      { student_id: "a", recently_active: true, prev_total: 2, prev_done: 1 },
      { student_id: "b", recently_active: false, prev_total: 1, prev_done: 0 },
    ]);
    expect([...fromRows.activeIds]).toEqual([...fromRpc.activeIds]);
    expect([...fromRows.prevWeek]).toEqual([...fromRpc.prevWeek]);
  });
});

describe("fetchStudentActivity", () => {
  it("asks the function once, with the window, and uses its answer (no row reads)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ student_id: "a", recently_active: true, prev_total: 2, prev_done: 1 }], error: null });
    const from = vi.fn();
    const result = await fetchStudentActivity({ rpc, from } as never, ["a", "b"], window);
    expect(rpc).toHaveBeenCalledWith("coach_dashboard_activity", {
      p_student_ids: ["a", "b"],
      p_recent_since: window.recentSince,
      p_prev_from: window.prevFrom,
      p_prev_to: window.prevTo,
    });
    expect(from).not.toHaveBeenCalled();
    expect(result.activeIds.has("a")).toBe(true);
  });

  it("before the migration is run (function missing) it falls back to reading the rows, with the same result", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tables: Record<string, Record<string, unknown>[]> = {
      student_tasks: [{ student_id: "a", updated_at: "2026-10-06T10:00:00Z", created_at: "2026-10-01T10:00:00Z", status: "done" }],
    };
    const from = () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "gte", "lte", "order", "range"]) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables.student_tasks, error: null, count: 1 });
      return b;
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "function public.coach_dashboard_activity does not exist" } });
    const result = await fetchStudentActivity({ rpc, from } as never, ["a"], window);
    expect([...result.activeIds]).toEqual(["a"]);
    expect(result.prevWeek.get("a")).toEqual({ done: 1, total: 1 });
  });

  it("with no students it asks nothing", async () => {
    const rpc = vi.fn();
    const result = await fetchStudentActivity({ rpc } as never, [], window);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.activeIds.size).toBe(0);
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
