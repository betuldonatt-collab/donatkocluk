import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { sessionBalance, type SessionBalanceRow } from "@/lib/session-balance";
import { resolveCycles, type CycleWindow, type ProgressLock } from "@/lib/completion";
import { fetchAllPages } from "@/lib/paged-select";
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

// The columns of a task the student's panel actually reads (the StudentTask type, minus the two computed fields and the
// long-dropped resource_id) -- listed instead of select("*") so nothing else rides along.
const STUDENT_TASK_COLUMNS =
  "id, task_date, task_type, title, description, course_id, topic_id, total_count, correct_count, wrong_count, empty_count, start_page, end_page, duration_minutes, tracked_duration_minutes, tracked_duration_seconds, subject_scores, video_links, completed, analysis_pending, evidence_image_paths, evidence_review_status, evidence_photo_status, status, reason, note, is_coach_assigned, order_index, rejected_at, rejection_reason";

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
  const dayAfterWeek = new Date(new Date(`${weekEnd}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  // Grace window so a session that just started still shows as "next"
  // instead of disappearing the moment its scheduled time passes.
  const graceCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const ratingCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  // The latest lock and the soonest pending session fix the cycle windows the progress cards read; that dependent read
  // starts the moment those two answer, while everything else is still being fetched (it used to wait for ALL of them).
  const lockQuery = supabase
    .from("progress_locks")
    .select("period_start, locked_at")
    .eq("student_id", userId)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const upcomingSessionQuery = supabase
    .from("coaching_sessions")
    .select("scheduled_at")
    .eq("student_id", userId)
    .eq("outcome", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const progressBundle = Promise.all([lockQuery, upcomingSessionQuery]).then(async ([{ data: lastLockRow }, { data: upcomingSessionRow }]) => {
    const lastLock = lastLockRow as ProgressLock | null;
    const { current: currentCycle, previous: previousCycle } = resolveCycles(
      lastLock,
      (upcomingSessionRow?.scheduled_at ?? null) as string | null,
      today,
    );
    // Slim rows for the progress cards: covers whichever reaches furthest back
    // (the previous cycle's start, the current cycle's start, or this week's
    // Monday) through whichever reaches furthest forward (the current cycle's
    // end -- not always "today", see lib/completion.ts -- or the day after
    // this week, Yarın on a Sunday).
    const progressTasksFrom = [previousCycle.start, currentCycle.start, weekStart].sort()[0];
    const progressTasksTo = currentCycle.end > dayAfterWeek ? currentCycle.end : dayAfterWeek;
    const { data: progressExtraRows } = await fetchAllPages((from, to, withCount) =>
      supabase
        .from("student_tasks")
        .select("id, task_date, status, task_type, course_id, title, total_count, duration_minutes", withCount ? { count: "exact" } : undefined)
        .eq("student_id", userId)
        .gte("task_date", progressTasksFrom)
        .lte("task_date", progressTasksTo)
        .order("task_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { lastLock, currentCycle, previousCycle, progressExtraRows };
  });

  const [
    { data: sessionRows },
    { data: weekTaskRows },
    { data: pendingTaskRows },
    { data: ratingSessionRows },
    { data: profileRow },
    { data: weekResourceRows },
    { data: pendingResourceRows },
    { data: fixedTaskRows },
    { data: allTaskDurationRows },
    { data: sessionBalanceRows },
    { data: reviewRows },
    { lastLock, currentCycle, previousCycle, progressExtraRows },
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
        .select(STUDENT_TASK_COLUMNS)
        .eq("student_id", userId)
        // From YESTERDAY, not just today: the grid is a rolling 7 days that
        // starts today, but the Dün tab needs yesterday's tasks on the very
        // first render (they were missing until the student browsed away and
        // back, so Dün showed the empty state).
        .gte("task_date", yesterdayIso)
        .lte("task_date", weekEnd)
        .order("created_at", { ascending: true }),
      // Every earlier task still waiting for its exam analysis -- read in pages, ordered totally (date, then id).
      fetchAllPages((from, to, withCount) =>
        supabase
          .from("student_tasks")
          .select(STUDENT_TASK_COLUMNS, withCount ? { count: "exact" } : undefined)
          .eq("student_id", userId)
          .eq("analysis_pending", true)
          .lt("task_date", yesterdayIso)
          .order("task_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      // Evaluation prompt: only a session completed in the last 14 days that
      // has never been rated (student_rating is set on submit, so a rated
      // session can never come back). Anything older -- notably the
      // bulk-imported historical sessions -- is ignored outright, never
      // prompted.
      supabase
        .from("coaching_sessions")
        .select("id, scheduled_at")
        .eq("student_id", userId)
        .eq("outcome", "completed")
        .is("student_rating", null)
        .gte("scheduled_at", ratingCutoff)
        .order("scheduled_at", { ascending: false })
        .limit(1),
      supabase.from("profiles").select("schedule_routine_row_heights_px, schedule_task_row_heights_px, exam_type").eq("id", userId).maybeSingle(),
      // Which book/kaynak (if any) a coach linked to each task -- mirrors the coach panel's own task_resources join
      // (schedule/page.tsx), scoped by student_tasks.student_id. Only for the tasks this page actually shows: the
      // week window, and (second read) the older pending-analysis ones -- not for every task the student ever had.
      supabase
        .from("task_resources")
        .select("task_id, order_index, student_tasks!inner(student_id), student_resources(name)")
        .eq("student_tasks.student_id", userId)
        .gte("student_tasks.task_date", yesterdayIso)
        .lte("student_tasks.task_date", weekEnd)
        .order("order_index", { ascending: true }),
      supabase
        .from("task_resources")
        .select("task_id, order_index, student_tasks!inner(student_id), student_resources(name)")
        .eq("student_tasks.student_id", userId)
        .eq("student_tasks.analysis_pending", true)
        .lt("student_tasks.task_date", yesterdayIso)
        .order("order_index", { ascending: true }),
      // "Sabit Görevler" -- week-independent (no date range), read-only
      // here (RLS: student_fixed_tasks_student_read). Same student-side
      // injection ScheduleBoard does for the coach, see task-board.tsx.
      supabase.from("student_fixed_tasks").select("id, title, day_of_week, start_time, end_time, description").eq("student_id", userId),
      // "Tüm Zamanlar" total for the dashboard's own Toplam Süre card --
      // one column only, and only the tasks that ever tracked any time
      // (tracked_duration_seconds only ever grows from a real completed Focus
      // Timer session, never a target, so it needs no status filter -- the
      // rows left out contribute 0 to the sum). Read in pages so a long
      // history is summed completely instead of being cut at the API's row cap.
      fetchAllPages((from, to, withCount) =>
        supabase
          .from("student_tasks")
          .select("tracked_duration_seconds", withCount ? { count: "exact" } : undefined)
          .eq("student_id", userId)
          .gt("tracked_duration_seconds", 0)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      // "Kalan Görüşme Hakkı" -- paid-count minus completed-count, allowed
      // to go negative on purpose (see 0084_session_payment_tracking.sql)
      // as a payment reminder, so this is deliberately NOT filtered to
      // is_paid=true only: a completed-but-unpaid session must still count
      // against the balance for the negative number to ever appear.
      fetchAllPages((from, to, withCount) =>
        supabase
          .from("coaching_sessions")
          .select("is_paid, outcome", withCount ? { count: "exact" } : undefined)
          .eq("student_id", userId)
          .order("scheduled_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      // Süre Tut sessions over 6 hours are held for the coach's approval (migration
      // 0086) instead of counting immediately -- shown so the student understands
      // why their time / rank hasn't moved. Pending ones always; decided ones for
      // two weeks. Best-effort: a failed read (e.g. before the migration is run)
      // just hides the card.
      supabase
        .from("focus_session_reviews")
        .select("id, seconds, status, approved_seconds, ended_at, reviewed_at, student_tasks(title)")
        .eq("student_id", userId)
        // Records the student dismissed themselves (migration 0105) stay in the
        // table for the coach's history but never come back here.
        .is("student_dismissed_at", null)
        .order("ended_at", { ascending: false })
        .limit(15),
      progressBundle,
    ]);

  // A task is frozen once its date falls STRICTLY BEFORE the latest lock day
  // -- the lock day itself belongs to the new, still-open cycle -- same
  // boundary the RLS policies enforce (migration 0103).
  const lockedThroughDate = lastLock ? lastLock.locked_at.slice(0, 10) : null;

  const resourceNamesByTask = new Map<string, string[]>();
  for (const row of [...(weekResourceRows ?? []), ...(pendingResourceRows ?? [])]) {
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
    week_locked: lockedThroughDate !== null && t.task_date < lockedThroughDate,
    resource_names: resourceNamesByTask.get(t.id) ?? [],
  })) as StudentTask[];

  const allTimeTrackedMinutes = Math.floor(
    (allTaskDurationRows ?? []).reduce((sum, r) => sum + (r.tracked_duration_seconds ?? 0), 0) / 60,
  );

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
    todayLocked: lockedThroughDate !== null && today < lockedThroughDate,
    // The current (still open, or the bootstrap two-week window) and
    // previous cycle's fixed date ranges (lib/completion.ts) -- always real,
    // displayable ranges now, never null.
    currentCycle,
    progressExtraTasks: (progressExtraRows ?? []) as ProgressTask[],
    previousCycle,
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
    currentCycle,
    progressExtraTasks,
    previousCycle,
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
        currentCycle: { start: todayISO(), end: todayISO() } as CycleWindow,
        progressExtraTasks: [] as ProgressTask[],
        previousCycle: { start: todayISO(), end: todayISO() } as CycleWindow,
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
        currentCycle={currentCycle}
        progressExtraTasks={progressExtraTasks}
        previousCycle={previousCycle}
        examType={examType}
        initialRoutineRowHeights={routineRowHeights}
        initialTaskRowHeights={taskRowHeights}
      />
    </div>
  );
}
