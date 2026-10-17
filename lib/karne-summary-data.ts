import type { SupabaseClient } from "@supabase/supabase-js";

import { aytTrackOf } from "./curriculum";
import { fetchMaarifGrade } from "./maarif-grade";
import { fetchAllPages } from "./paged-select";
import { studyStatusSelect } from "./task-study-status";
import { fetchStudentEventAttendance } from "./student-event-attendance";
import { computeKarneSummary, DEFAULT_TREND_WEEKS, summaryDataStart, type KarneSummary, type KarneSummaryTask } from "./karne-summary";

const TASK_COLUMNS =
  "task_date, status, task_type, course_id, title, total_count, duration_minutes, correct_count, wrong_count, empty_count, tracked_duration_minutes, subject_scores";

// Reads what computeKarneSummary needs for one student and period, as whoever is looking (RLS decides what that person may read: the
// student their own, a coach their roster's, a parent their linked child's). Only coach-assigned / coach-approved tasks are used, like
// every other Karne figure. The task read is bounded to [the earlier of the previous period / the trend's first week, rangeEnd] and
// paged, so a long history never reaches it.
export async function fetchKarneSummary(
  supabase: SupabaseClient,
  studentId: string,
  rangeStart: string,
  rangeEnd: string,
  options: { today?: string; now?: string; trendWeeks?: number } = {},
): Promise<KarneSummary> {
  const now = options.now ?? new Date().toISOString();
  const today = options.today ?? now.slice(0, 10);
  const trendWeeks = options.trendWeeks ?? DEFAULT_TREND_WEEKS;
  const from = summaryDataStart(rangeStart, rangeEnd, today, trendWeeks);
  const studyCol = await studyStatusSelect(supabase);

  const [{ data: profile }, maarifGrade, tasks, events] = await Promise.all([
    supabase.from("profiles").select("academic_track").eq("id", studentId).maybeSingle(),
    fetchMaarifGrade(supabase, studentId),
    fetchAllPages<KarneSummaryTask>((fromRow, toRow, withCount) =>
      supabase
        .from("student_tasks")
        .select(TASK_COLUMNS + studyCol, withCount ? { count: "exact" } : undefined)
        .eq("student_id", studentId)
        .or("is_coach_assigned.eq.true,is_approved_by_coach.eq.true")
        .gte("task_date", from)
        .lte("task_date", rangeEnd)
        .order("task_date", { ascending: true })
        .order("id", { ascending: true })
        .range(fromRow, toRow) as unknown as PromiseLike<{ data: KarneSummaryTask[] | null; error: unknown; count?: number | null }>,
    ),
    fetchStudentEventAttendance(supabase, studentId, rangeStart, rangeEnd),
  ]);

  return computeKarneSummary({
    rangeStart,
    rangeEnd,
    today,
    now,
    tasks: tasks.data,
    events,
    aytTrack: aytTrackOf((profile as { academic_track?: string | null } | null)?.academic_track),
    maarifGrade: maarifGrade === 7 || maarifGrade === 11 ? maarifGrade : null,
    trendWeeks,
  });
}
