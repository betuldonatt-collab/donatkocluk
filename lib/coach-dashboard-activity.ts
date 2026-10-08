import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllPages } from "@/lib/paged-select";

// What the coach dashboard's two activity alerts need, per student: was the student active in the last days (any task touched after
// it was created), and last week's done / total task counts. Computed in the database by public.coach_dashboard_activity (migration
// 0134) so the dashboard does not download thousands of task rows on every render. Until that migration has been run the same
// numbers are derived from the rows, exactly as before -- so deploying before running it changes nothing for the coach.

export type PrevWeekBucket = { done: number; total: number };
export type StudentActivity = { activeIds: Set<string>; prevWeek: Map<string, PrevWeekBucket> };
export type ActivityWindow = {
  // ISO timestamp: tasks touched since then count as activity.
  recentSince: string;
  // Last week's first and last day (YYYY-MM-DD).
  prevFrom: string;
  prevTo: string;
};

type RpcRow = { student_id: string; recently_active: boolean; prev_total: number; prev_done: number };

export const NO_ACTIVITY: StudentActivity = { activeIds: new Set(), prevWeek: new Map() };

export function activityFromRpcRows(rows: RpcRow[]): StudentActivity {
  const activeIds = new Set<string>();
  const prevWeek = new Map<string, PrevWeekBucket>();
  for (const r of rows) {
    if (r.recently_active) activeIds.add(r.student_id);
    if (r.prev_total > 0) prevWeek.set(r.student_id, { done: r.prev_done, total: r.prev_total });
  }
  return { activeIds, prevWeek };
}

// The row-based derivation (the previous implementation, kept as the fallback).
export function activityFromTaskRows(
  recentRows: { student_id: string; updated_at: string; created_at: string }[],
  prevWeekRows: { student_id: string; status: string }[],
): StudentActivity {
  // A row only counts as genuine activity if it was touched after creation -- a freshly assigned, never-opened task inserts with
  // updated_at === created_at and shouldn't count as the student being "active".
  const activeIds = new Set(
    recentRows.filter((r) => new Date(r.updated_at).getTime() !== new Date(r.created_at).getTime()).map((r) => r.student_id),
  );
  const prevWeek = new Map<string, PrevWeekBucket>();
  for (const r of prevWeekRows) {
    const b = prevWeek.get(r.student_id) ?? { done: 0, total: 0 };
    b.total += 1;
    if (r.status === "done") b.done += 1;
    prevWeek.set(r.student_id, b);
  }
  return { activeIds, prevWeek };
}

export async function fetchStudentActivity(supabase: SupabaseClient, studentIds: string[], window: ActivityWindow): Promise<StudentActivity> {
  if (studentIds.length === 0) return NO_ACTIVITY;

  const { data, error } = await supabase.rpc("coach_dashboard_activity", {
    p_student_ids: studentIds,
    p_recent_since: window.recentSince,
    p_prev_from: window.prevFrom,
    p_prev_to: window.prevTo,
  });
  if (!error) return activityFromRpcRows((data ?? []) as RpcRow[]);

  // Function not there yet (migration 0134 not run) or the call failed: read the rows instead.
  console.warn("[coach dashboard] coach_dashboard_activity unavailable, falling back to row reads:", error.message ?? error);
  const [recent, prev] = await Promise.all([
    fetchAllPages<{ student_id: string; updated_at: string; created_at: string }>((from, to, withCount) =>
      supabase
        .from("student_tasks")
        .select("student_id, updated_at, created_at", withCount ? { count: "exact" } : undefined)
        .in("student_id", studentIds)
        .gte("updated_at", window.recentSince)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ student_id: string; status: string }>((from, to, withCount) =>
      supabase
        .from("student_tasks")
        .select("student_id, status", withCount ? { count: "exact" } : undefined)
        .in("student_id", studentIds)
        .gte("task_date", window.prevFrom)
        .lte("task_date", window.prevTo)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  return activityFromTaskRows(recent.data, prev.data);
}
