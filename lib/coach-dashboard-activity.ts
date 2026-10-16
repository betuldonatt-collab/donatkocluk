import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllPages } from "@/lib/paged-select";
import { weightedCounts, type WeightableTask } from "@/lib/effort-weight";

// What the coach dashboard's two activity alerts need, per student:
//  - was the student active in the last days (any task touched after it was created). Counted in the database by
//    public.coach_dashboard_activity (migration 0134), so the dashboard does not download thousands of task rows on every render; until
//    that migration has been run the same answer is derived from the rows, exactly as before.
//  - last week's completion, on the SAME effort-weighted math as every other percentage in the app (lib/effort-weight.ts): each task's
//    full weight is the denominator, the weight it earned (all when done, solved / target when half done, none otherwise) the numerator.
//    That cannot come from the function's plain done / total counts, so last week's task rows (one week of one roster -- small) are read
//    and summed here. (The function still returns prev_total / prev_done; they are no longer used.)

// done / total are effort units (weightedCounts), not task counts.
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
export type PrevWeekTaskRow = WeightableTask & { student_id: string };

export const NO_ACTIVITY: StudentActivity = { activeIds: new Set(), prevWeek: new Map() };

export function activeIdsFromRpcRows(rows: RpcRow[]): Set<string> {
  return new Set(rows.filter((r) => r.recently_active).map((r) => r.student_id));
}

// The row-based derivation (the previous implementation, kept as the fallback).
// A row only counts as genuine activity if it was touched after creation -- a freshly assigned, never-opened task inserts with
// updated_at === created_at and shouldn't count as the student being "active".
export function activeIdsFromTaskRows(recentRows: { student_id: string; updated_at: string; created_at: string }[]): Set<string> {
  return new Set(recentRows.filter((r) => new Date(r.updated_at).getTime() !== new Date(r.created_at).getTime()).map((r) => r.student_id));
}

// Per student: the effort-weighted done / total of the given week's tasks (no entry for a student with no task that week).
export function prevWeekFromTaskRows(rows: PrevWeekTaskRow[]): Map<string, PrevWeekBucket> {
  const byStudent = new Map<string, PrevWeekTaskRow[]>();
  for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);
  const prevWeek = new Map<string, PrevWeekBucket>();
  for (const [studentId, tasks] of byStudent) prevWeek.set(studentId, weightedCounts(tasks));
  return prevWeek;
}

export const PREV_WEEK_COLUMNS =
  "student_id, task_date, status, task_type, course_id, title, total_count, duration_minutes, correct_count, wrong_count, empty_count";

export async function fetchStudentActivity(supabase: SupabaseClient, studentIds: string[], window: ActivityWindow): Promise<StudentActivity> {
  if (studentIds.length === 0) return NO_ACTIVITY;

  const [rpc, prev] = await Promise.all([
    supabase.rpc("coach_dashboard_activity", {
      p_student_ids: studentIds,
      p_recent_since: window.recentSince,
      p_prev_from: window.prevFrom,
      p_prev_to: window.prevTo,
    }),
    fetchAllPages<PrevWeekTaskRow>((from, to, withCount) =>
      supabase
        .from("student_tasks")
        .select(PREV_WEEK_COLUMNS, withCount ? { count: "exact" } : undefined)
        .in("student_id", studentIds)
        .gte("task_date", window.prevFrom)
        .lte("task_date", window.prevTo)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: PrevWeekTaskRow[] | null; error: unknown; count?: number | null }>,
    ),
  ]);
  const prevWeek = prevWeekFromTaskRows(prev.data);
  if (!rpc.error) return { activeIds: activeIdsFromRpcRows((rpc.data ?? []) as RpcRow[]), prevWeek };

  // Function not there yet (migration 0134 not run) or the call failed: read the rows instead.
  console.warn("[coach dashboard] coach_dashboard_activity unavailable, falling back to row reads:", rpc.error.message ?? rpc.error);
  const recent = await fetchAllPages<{ student_id: string; updated_at: string; created_at: string }>((from, to, withCount) =>
    supabase
      .from("student_tasks")
      .select("student_id, updated_at, created_at", withCount ? { count: "exact" } : undefined)
      .in("student_id", studentIds)
      .gte("updated_at", window.recentSince)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return { activeIds: activeIdsFromTaskRows(recent.data), prevWeek };
}
