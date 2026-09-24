import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { sessionBalance, type SessionBalanceRow } from "@/lib/session-balance";
import { mondayOf } from "@/lib/date";
import { reconcileStaleFocusSessions } from "./actions";
import { FocusReviewsCard, type StudentFocusReview } from "./_components/focus-timer/focus-reviews-card";
import { NextSessionCard } from "./_components/next-session-card";
import { RemainingSessionsCard } from "./_components/remaining-sessions-card";
import { SessionRatingBanner } from "./_components/session-rating-banner";
import type { ProgressTask } from "./_components/daily-tasks/progress-overview";
import { TaskBoard } from "./_components/daily-tasks/task-board";
import type { StudentFixedTask, StudentTask } from "./_components/daily-tasks/types";
import type { ExamType } from "@/lib/exam-type";
import type { SessionNeedingRating } from "./_components/types";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// A rolling 7-day window starting EXACTLY at referenceIso -- NOT
// Monday-aligned, mirroring task-board.tsx's own client-side nav (Prev/
// Next shift by exactly 1 day, not a whole week) so the very first render
// already matches whatever the board would compute itself after a click.
// Ported from the coach's own schedule/page.tsx, which established this
// exact pattern first.
function getWeekDays(referenceIso: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${referenceIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    return { date, label: `${DAY_LABELS[dow]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

async function fetchHomeData(userId: string) {
  const supabase = await createClient();
  // Bank any focus session this student left stranded (closed the tab
  // mid-timer and never reopened that specific task again) before reading
  // student_tasks below, so a just-banked total is reflected on this very
  // render instead of waiting for the student to stumble into it some
  // other way. Best-effort: reconcileStaleFocusSessions never throws.
  await reconcileStaleFocusSessions();
  const today = todayISO();
  const weekDays = getWeekDays(today);
  const weekStart = weekDays[0].date;
  const weekEnd = weekDays[6].date;
  const yesterdayIso = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const prevWeekStart = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const dayAfterWeek = new Date(new Date(`${weekEnd}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  // Grace window so a session that just started still shows as "next"
  // instead of disappearing the moment its scheduled time passes.
  const graceCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const [
    { data: sessionRows },
    { data: weekTaskRows },
    { data: pendingTaskRows },
    { data: ratingSessionRows },
    { data: lockRows },
    { data: profileRow },
    { data: taskResourceRows },
    { data: fixedTaskRows },
    { data: allTaskDurationRows },
    { data: sessionBalanceRows },
    { data: progressExtraRows },
  ] = await Promise.all([
      supabase
        .from("coaching_sessions")
        .select("scheduled_at, meeting_url")
        .eq("student_id", userId)
        .gte("scheduled_at", graceCutoff)
        .order("scheduled_at", { ascending: true })
        .limit(1),
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", userId)
        // From YESTERDAY, not just today: the grid is a rolling 7 days that
        // starts today, but the Dün tab needs yesterday's tasks on the very
        // first render (they were missing until the student browsed away and
        // back, so Dün showed the empty state).
        .gte("task_date", yesterdayIso)
        .lte("task_date", weekEnd)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", userId)
        .eq("analysis_pending", true)
        .lt("task_date", yesterdayIso)
        .order("task_date", { ascending: false }),
      supabase
        .from("coaching_sessions")
        .select("id, scheduled_at")
        .eq("student_id", userId)
        .eq("outcome", "completed")
        .is("student_rating", null)
        .order("scheduled_at", { ascending: false })
        .limit(1),
      // Every locked week for this student, not just the current one --
      // an older pending-analysis task (pendingTaskRows, above) can belong
      // to a week the coach has since locked.
      supabase.from("week_locks").select("week_start_date, locked_at").eq("student_id", userId),
      supabase.from("profiles").select("schedule_routine_row_heights_px, schedule_task_row_heights_px, exam_type").eq("id", userId).maybeSingle(),
      // Which book/kaynak (if any) a coach linked to each task -- mirrors
      // the coach panel's own task_resources join (schedule/page.tsx)
      // exactly, just scoped by student_tasks.student_id instead of by
      // coach roster. Not filtered on lock/date range: a resource name is
      // cheap, harmless to fetch for a pending-analysis task from an
      // older week too, and doing so here avoids a second query shaped
      // just for that handful of rows.
      supabase
        .from("task_resources")
        .select("task_id, order_index, student_tasks!inner(student_id), student_resources(name)")
        .eq("student_tasks.student_id", userId)
        .order("order_index", { ascending: true }),
      // "Sabit Görevler" -- week-independent (no date range), read-only
      // here (RLS: student_fixed_tasks_student_read). Same student-side
      // injection ScheduleBoard does for the coach, see task-board.tsx.
      supabase.from("student_fixed_tasks").select("*").eq("student_id", userId),
      // "Tüm Zamanlar" total for the dashboard's own Toplam Süre card --
      // every task ever, one column only (cheap). tracked_duration_seconds
      // only ever grows from a real completed Focus Timer session (never a
      // target), so it needs no status filter -- summing across every
      // task, any status, is already exactly "real time tracked."
      supabase.from("student_tasks").select("tracked_duration_seconds").eq("student_id", userId),
      // "Kalan Görüşme Hakkı" -- paid-count minus completed-count, allowed
      // to go negative on purpose (see 0084_session_payment_tracking.sql)
      // as a payment reminder, so this is deliberately NOT filtered to
      // is_paid=true only: a completed-but-unpaid session must still count
      // against the balance for the negative number to ever appear.
      supabase.from("coaching_sessions").select("is_paid, outcome").eq("student_id", userId),
      // Slim rows for the progress cards: last week (Geçen Hafta) plus the
      // day after this week (Yarın on a Sunday). Dün on a Monday is inside
      // the same range.
      supabase
        .from("student_tasks")
        .select("id, task_date, status, task_type, course_id, title, total_count, duration_minutes")
        .eq("student_id", userId)
        .gte("task_date", prevWeekStart)
        .lte("task_date", dayAfterWeek),
    ]);

  const lockedWeeks = new Set((lockRows ?? []).map((r) => r.week_start_date));

  const resourceNamesByTask = new Map<string, string[]>();
  for (const row of taskResourceRows ?? []) {
    const name = (row as unknown as { student_resources: { name: string } | null }).student_resources?.name;
    if (!name) continue;
    const list = resourceNamesByTask.get(row.task_id) ?? [];
    list.push(name);
    resourceNamesByTask.set(row.task_id, list);
  }

  // Pending-analysis tasks from earlier weeks aren't in the week fetch,
  // so merge them in (dedup not needed — the date ranges don't overlap).
  const tasks = [...(weekTaskRows ?? []), ...(pendingTaskRows ?? [])].map((t) => ({
    ...t,
    week_locked: lockedWeeks.has(mondayOf(t.task_date)),
    resource_names: resourceNamesByTask.get(t.id) ?? [],
  })) as StudentTask[];

  const allTimeTrackedMinutes = Math.floor(
    (allTaskDurationRows ?? []).reduce((sum, r) => sum + (r.tracked_duration_seconds ?? 0), 0) / 60,
  );

  // Süre Tut sessions over 6 hours are held for the coach's approval (migration
  // 0086) instead of counting immediately -- shown so the student understands
  // why their time / rank hasn't moved. Pending ones always; decided ones for
  // two weeks. Best-effort: a failed read (e.g. before the migration is run)
  // just hides the card.
  const { data: reviewRows } = await supabase
    .from("focus_session_reviews")
    .select("id, seconds, status, approved_seconds, ended_at, reviewed_at, student_tasks(title)")
    .eq("student_id", userId)
    .order("ended_at", { ascending: false })
    .limit(15);
  const reviewCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const focusReviews: StudentFocusReview[] = (reviewRows ?? [])
    .filter((r) => r.status === "pending" || new Date(r.reviewed_at ?? r.ended_at).getTime() >= reviewCutoff)
    .map((r) => {
      const task = Array.isArray(r.student_tasks) ? r.student_tasks[0] : r.student_tasks;
      return {
        id: r.id as string,
        taskTitle: (task?.title as string | undefined) ?? "Çalışma",
        seconds: r.seconds as number,
        status: r.status as StudentFocusReview["status"],
        approvedSeconds: r.approved_seconds as number | null,
        endedAt: r.ended_at as string,
      };
    });

  const remainingSessions = sessionBalance((sessionBalanceRows ?? []) as SessionBalanceRow[]).remaining;

  return {
    today,
    weekDays,
    nextSession: sessionRows?.[0] ?? null,
    tasks,
    sessionNeedingRating: (ratingSessionRows?.[0] ?? null) as SessionNeedingRating | null,
    fixedTasks: (fixedTaskRows ?? []) as StudentFixedTask[],
    allTimeTrackedMinutes,
    remainingSessions,
    focusReviews,
    examType: (profileRow?.exam_type ?? "YKS") as ExamType,
    todayLocked: lockedWeeks.has(mondayOf(today)),
    // When the coach locked THIS week's schedule: where the student's
    // progress bar starts counting (lib/completion.ts).
    progressLockedAt: ((lockRows ?? []).find((r) => r.week_start_date === mondayOf(today))?.locked_at ?? null) as string | null,
    progressExtraTasks: (progressExtraRows ?? []) as ProgressTask[],
    previousLockedAt: ((lockRows ?? []).find((r) => r.week_start_date === prevWeekStart)?.locked_at ?? null) as string | null,
    routineRowHeights: profileRow?.schedule_routine_row_heights_px ?? [],
    taskRowHeights: profileRow?.schedule_task_row_heights_px ?? [],
  };
}

export default async function StudentHomePage() {
  const view = await getViewContext("student");

  const {
    today,
    weekDays,
    nextSession,
    tasks,
    sessionNeedingRating,
    fixedTasks,
    allTimeTrackedMinutes,
    remainingSessions,
    focusReviews,
    examType,
    todayLocked,
    progressLockedAt,
    progressExtraTasks,
    previousLockedAt,
    routineRowHeights,
    taskRowHeights,
  } = view
    ? await fetchHomeData(view.effectiveUserId)
    : {
        today: todayISO(),
        weekDays: getWeekDays(todayISO()),
        nextSession: null,
        tasks: [] as StudentTask[],
        sessionNeedingRating: null as SessionNeedingRating | null,
        fixedTasks: [] as StudentFixedTask[],
        allTimeTrackedMinutes: 0,
        remainingSessions: 0,
        focusReviews: [] as StudentFocusReview[],
        examType: "YKS" as ExamType,
        todayLocked: false,
        progressLockedAt: null as string | null,
        progressExtraTasks: [] as ProgressTask[],
        previousLockedAt: null as string | null,
        routineRowHeights: [] as number[],
        taskRowHeights: [] as number[],
      };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Ana Sayfa</h1>
        <p className="text-muted-foreground text-sm">Tekrar hoş geldin!</p>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <NextSessionCard
          scheduledAt={nextSession?.scheduled_at ?? null}
          meetingUrl={nextSession?.meeting_url ?? null}
        />
        <RemainingSessionsCard remaining={remainingSessions} />
      </div>

      {sessionNeedingRating && (
        <div className="mb-6">
          <SessionRatingBanner session={sessionNeedingRating} />
        </div>
      )}

      {focusReviews.length > 0 && (
        <div className="mb-6">
          <FocusReviewsCard reviews={focusReviews} />
        </div>
      )}

      <TaskBoard
        today={today}
        weekDays={weekDays}
        initialTasks={tasks}
        fixedTasks={fixedTasks}
        allTimeTrackedMinutes={allTimeTrackedMinutes}
        todayLocked={todayLocked}
        progressLockedAt={progressLockedAt}
        progressExtraTasks={progressExtraTasks}
        previousLockedAt={previousLockedAt}
        examType={examType}
        initialRoutineRowHeights={routineRowHeights}
        initialTaskRowHeights={taskRowHeights}
      />
    </div>
  );
}
