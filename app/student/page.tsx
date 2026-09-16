import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { mondayOf, weekDates } from "@/lib/date";
import { NextSessionCard } from "./_components/next-session-card";
import { SessionRatingBanner } from "./_components/session-rating-banner";
import { TaskBoard } from "./_components/daily-tasks/task-board";
import type { StudentTask } from "./_components/daily-tasks/types";
import type { SessionNeedingRating } from "./_components/types";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Monday-through-Sunday week containing `todayISO`, computed in UTC to
// match todayISO()'s own UTC-based "today" (see fetchHomeData).
function getWeekDays(todayIso: string) {
  // weekDates returns Monday..Sunday in order, so the array index doubles
  // as the DAY_LABELS index directly.
  return weekDates(todayIso).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[i]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

async function fetchHomeData(userId: string) {
  const supabase = await createClient();
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

  return {
    today,
    weekDays,
    nextSession: sessionRows?.[0] ?? null,
    tasks,
    sessionNeedingRating: (ratingSessionRows?.[0] ?? null) as SessionNeedingRating | null,
    todayLocked: lockedWeeks.has(mondayOf(today)),
    routineRowHeights: profileRow?.schedule_routine_row_heights_px ?? [],
    taskRowHeights: profileRow?.schedule_task_row_heights_px ?? [],
  };
}

export default async function StudentHomePage() {
  const view = await getViewContext("student");

  const { today, weekDays, nextSession, tasks, sessionNeedingRating, todayLocked, routineRowHeights, taskRowHeights } = view
    ? await fetchHomeData(view.effectiveUserId)
    : {
        today: todayISO(),
        weekDays: getWeekDays(todayISO()),
        nextSession: null,
        tasks: [] as StudentTask[],
        sessionNeedingRating: null as SessionNeedingRating | null,
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
        todayLocked={todayLocked}
        initialRoutineRowHeights={routineRowHeights}
        initialTaskRowHeights={taskRowHeights}
      />
    </div>
  );
}
