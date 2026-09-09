import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { MonthNavigator } from "./_components/month-navigator";
import { SessionsClient } from "./_components/sessions-client";
import type { CoachingSession, RosterStudent } from "../dashboard/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isValidMonthString(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}-01T00:00:00Z`).getTime());
}

function addMonthsISO(monthStr: string, months: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 42-cell Monday-start grid: leading/trailing days from adjacent months
// fill out every displayed week completely, same "always full weeks"
// convention as the weekly calendar's own getWeekDays.
function getMonthGrid(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const dow = firstOfMonth.getUTCDay();
  const leadingDays = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - leadingDays);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      dayOfMonth: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1 && d.getUTCFullYear() === y,
    };
  });
}

async function fetchSessionsData(coachId: string, month: string) {
  const supabase = await createClient();
  const monthStart = `${month}-01T00:00:00Z`;
  const monthEndExclusive = `${addMonthsISO(month, 1)}-01T00:00:00Z`;

  const [{ data: rosterLinks }, { data: sessionRows }] = await Promise.all([
    supabase.from("coach_students").select("student_id").eq("coach_id", coachId),
    supabase
      .from("coaching_sessions")
      .select("*")
      .eq("coach_id", coachId)
      .gte("scheduled_at", monthStart)
      .lt("scheduled_at", monthEndExclusive)
      .order("scheduled_at", { ascending: true }),
  ]);

  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  const { data: profiles } =
    studentIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", studentIds)
      : { data: [] };

  return {
    roster: (profiles ?? []) as RosterStudent[],
    sessions: (sessionRows ?? []) as CoachingSession[],
  };
}

export default async function CoachSessionsPage(props: PageProps<"/coach/sessions">) {
  const searchParams = await props.searchParams;
  const monthParam = Array.isArray(searchParams.month) ? searchParams.month[0] : searchParams.month;

  const todayIso = todayISO();
  const currentMonth = todayIso.slice(0, 7);
  const month = isValidMonthString(monthParam) ? monthParam : currentMonth;
  const grid = getMonthGrid(month);

  const view = await getViewContext("coach");

  const { roster, sessions } = view
    ? await fetchSessionsData(view.effectiveUserId, month)
    : { roster: [] as RosterStudent[], sessions: [] as CoachingSession[] };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Görüşmelerim</h1>
        <p className="text-muted-foreground text-sm">Aylık görüşme takvimin ve öğrenci geri bildirimleri.</p>
      </header>

      <div className="mb-4">
        <MonthNavigator month={month} isCurrentMonth={month === currentMonth} />
      </div>

      <SessionsClient key={month} grid={grid} roster={roster} sessions={sessions} todayIso={todayIso} />
    </div>
  );
}
