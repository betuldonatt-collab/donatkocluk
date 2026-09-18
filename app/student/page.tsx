import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { mondayOf } from "@/lib/date";
import { reconcileStaleFocusSessions } from "./actions";
import { NextSessionCard } from "./_components/next-session-card";
import { SessionRatingBanner } from "./_components/session-rating-banner";
import { TaskBoard } from "./_components/daily-tasks/task-board";
import type { StudentFixedTask, StudentTask } from "./_components/daily-tasks/types";
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
        .gte("task_date", weekStart)
        .lte("task_date", weekEnd)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", userId)
        .eq("analysis_pending", true)
        .lt("task_date", weekStart)
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
      supabase.from("week_locks").select("week_start_date").eq("student_id", userId),
      supabase.from("profiles").select("schedule_routine_row_heights_px, schedule_task_row_heights_px").eq("id", userId).maybeSingle(),
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
      supabase.from("student_fixed_tasks").select("id, title, day_of_week, start_time, end_time").eq("student_id", userId),
      // "Tüm Zamanlar" total for the dashboard's own Toplam Süre card --
      // every task ever, one column only (cheap). tracked_duration_seconds
      // only ever grows from a real completed Focus Timer session (never a
      // target), so it needs no status filter -- summing across every
      // task, any status, is already exactly "real time tracked."
      supabase.from("student_tasks").select("tracked_duration_seconds").eq("student_id", userId),
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

  return {
    today,
    weekDays,
    nextSession: sessionRows?.[0] ?? null,
    tasks,
    sessionNeedingRating: (ratingSessionRows?.[0] ?? null) as SessionNeedingRating | null,
    fixedTasks: (fixedTaskRows ?? []) as StudentFixedTask[],
    allTimeTrackedMinutes,
    todayLocked: lockedWeeks.has(mondayOf(today)),
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
    todayLocked,
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
        todayLocked: false,
        routineRowHeights: [] as number[],
        taskRowHeights: [] as number[],
      };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Ana Sayfa</h1>
        <p className="text-muted-foreground text-sm">Tekrar hoş geldin!</p>
      </header>

      <div className="mb-6">
        <NextSessionCard
          scheduledAt={nextSession?.scheduled_at ?? null}
          meetingUrl={nextSession?.meeting_url ?? null}
        />
      </div>

      {sessionNeedingRating && (
        <div className="mb-6">
          <SessionRatingBanner session={sessionNeedingRating} />
        </div>
      )}

      <TaskBoard
        today={today}
        weekDays={weekDays}
        initialTasks={tasks}
        fixedTasks={fixedTasks}
        allTimeTrackedMinutes={allTimeTrackedMinutes}
        todayLocked={todayLocked}
        initialRoutineRowHeights={routineRowHeights}
        initialTaskRowHeights={taskRowHeights}
      />
    </div>
  );
}
