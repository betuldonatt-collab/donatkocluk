import { createClient } from "@/lib/supabase/server";
import { logPerf, startPerf } from "@/lib/perf-log";
import { getActiveStudentId, getLinkedStudents } from "@/lib/parent-context";
import { getAuthUser } from "@/lib/supabase/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeLgsNet, computeNet } from "@/lib/scoring";
import { mondayOf } from "@/lib/date";
import { sessionBalance } from "@/lib/session-balance";
import { completionPercent, resolveCycles, type ProgressLock } from "@/lib/completion";
import { weightedCycleCounts, type WeightableTask } from "@/lib/effort-weight";
import { DailyProgressCard, type DailyProgressTask } from "@/components/daily-progress-card";
import { isLgsParentView } from "@/lib/parent-lgs";
import { isGeneralExamScoresIncomplete } from "@/lib/exam-results-validation";
import { AutoRefresh } from "@/components/auto-refresh";
import { WeeklyProgressCard } from "@/components/weekly-progress-card";
import { LineChart } from "./_components/line-chart";
import { SessionCalendar, type ParentSession } from "./_components/session-calendar";
import { SessionQuotaStats } from "./_components/session-quota-stats";
import { WeeklyStatsSummary, type WeekStat } from "./_components/weekly-stats-summary";
import { WeeklyProgramSheet, type ProgramTask } from "./_components/weekly-program-sheet";

type SubjectScores = Record<string, { correct?: number; wrong?: number }>;
type GeneralExam = { id: string; title: string; task_date: string; subject_scores: SubjectScores | null };

// General-exam tasks have no course_id -- the TYT/AYT track lives only in
// the title text, same convention the student/coach panels already parse.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" | "lgs" | "m7" | "m9" | "m10" {
  if (/^7\.\s*SINIF\b/i.test(title)) return "m7";
  if (/^9\.\s*SINIF\b/i.test(title)) return "m9";
  if (/^10\.\s*SINIF\b/i.test(title)) return "m10";
  if (/^LGS\b/i.test(title)) return "lgs";
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

// Overall net = sum of correct/wrong across all subjects, netted once on
// the totals (not summed per-subject net) so rounding never compounds.
// Unlike the student's own Genel Analiz page, this doesn't split AYT by
// track (sayısal/EA/sözel/YDT) -- the parent view just wants one line per
// exam type, not the track-selector complexity.
// netFn is the cohort's own negative-marking rule (YKS 4:1, LGS 3:1).
function netChartFor(exams: GeneralExam[], netFn: (correct: number, wrong: number) => number = computeNet) {
  return exams
    .filter((e) => e.subject_scores)
    .slice()
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
    .map((e) => {
      const totals = Object.values(e.subject_scores!).reduce<{ correct: number; wrong: number }>(
        (acc, s) => ({ correct: acc.correct + (s.correct ?? 0), wrong: acc.wrong + (s.wrong ?? 0) }),
        { correct: 0, wrong: 0 },
      );
      return { date: e.task_date, value: netFn(totals.correct, totals.wrong) };
    });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekRange(referenceIso: string) {
  const start = mondayOf(referenceIso);
  const sunday = new Date(`${start}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { start, end: sunday.toISOString().slice(0, 10) };
}


function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Softened per product decision: sums only the total questions solved --
// no Doğru/Yanlış/Boş breakdown is computed or passed to the parent view
// at all anymore (see WeeklyStatsSummary).
function sumWeekStats(rows: { total: number }[]): WeekStat {
  return { total: rows.reduce((acc, r) => acc + r.total, 0) };
}

async function fetchDashboardData() {
  const perfStart = startPerf();
  // One auth call per render (request-level cache, lib/supabase/session.ts).
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();

  const studentId = await getActiveStudentId();
  if (!studentId) return { student: null };

  const today = todayISO();
  const { start, end } = getWeekRange(today);
  // The student's own profile row rides along with the (cached) linked-students
  // lookup the layout already ran -- no second profiles read here.
  const profile = (await getLinkedStudents()).find((s) => s.id === studentId) ?? null;
  const isLgsStudent = isLgsParentView(profile?.exam_type, profile?.is_maarif7);

  // Phase 1: sessions (needed both for the session list AND to resolve the
  // student's cycle bounds below) + everything else independent of the task
  // window's date range.
  const [{ data: sessionRows }, { data: lockRow }, { data: dailyStatsRows }, { data: examRows }] = await Promise.all([
    supabase
      .from("coaching_sessions")
      .select("id, scheduled_at, outcome, is_paid")
      .eq("student_id", studentId)
      .order("scheduled_at", { ascending: false }),
    // The single most recent progress lock -- where completion currently
    // starts counting (lib/completion.ts). No lock yet -> resolved below
    // from the student's first completed session.
    supabase
      .from("progress_locks")
      .select("period_start, locked_at")
      .eq("student_id", studentId)
      .order("locked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // The parent view only ever shows a "Toplam Çözülen Soru" total, never the
    // Doğru/Yanlış/Boş breakdown (see WeeklyStatsSummary).
    supabase
      .from("student_daily_stats")
      .select("total_count")
      .eq("student_id", studentId)
      .gte("entry_date", start)
      .lte("entry_date", end),
    supabase
      .from("student_tasks")
      .select("id, title, task_date, subject_scores")
      .eq("student_id", studentId)
      .eq("task_type", "general_exam")
      .order("task_date", { ascending: false }),
  ]);

  if (!profile) return { student: null };

  const sessions = (sessionRows ?? []) as ParentSession[];
  // No lock yet -> the soonest still-pending session anchors the bootstrap
  // two-week window (lib/completion.ts).
  const upcomingSessionAt = sessions
    .filter((s) => s.outcome === "pending")
    .reduce<string | null>((soonest, s) => (soonest === null || s.scheduled_at < soonest ? s.scheduled_at : soonest), null);
  const { current: currentCycle, previous: previousCycle } = resolveCycles(lockRow as ProgressLock | null, upcomingSessionAt, today);

  // student_tasks is read ONCE for the whole window this render needs (the
  // program sheet's calendar week, plus however far the current/previous
  // cycle actually reaches -- not always the same 7 days) and sliced in
  // memory below.
  const tasksFrom = [start, currentCycle.start, previousCycle.start].sort()[0];
  const tasksTo = [addDays(end, 1), currentCycle.end].sort().reverse()[0];
  const { data: taskWindowRows } = await supabase
    // Security note: the rows below are sliced server-side. Only the slim
    // program fields ever cross into the client component (WeeklyProgramSheet);
    // the Doğru/Yanlış/Boş-style counts stay on the server, used only for the
    // effort-weighted percentages.
    .from("student_tasks")
    .select("id, title, task_type, course_id, task_date, status, order_index, total_count, duration_minutes")
    .eq("student_id", studentId)
    .gte("task_date", tasksFrom)
    .lte("task_date", tasksTo)
    .order("task_date", { ascending: true })
    .order("order_index", { ascending: true });

  logPerf("parent home data batch", perfStart);

  type WindowRow = WeightableTask & { id: string; title: string; order_index: number };
  const windowRows = (taskWindowRows ?? []) as unknown as WindowRow[];
  const inRange = (from: string, to: string) => windowRows.filter((t) => t.task_date >= from && t.task_date <= to);
  const weekRows = inRange(start, end);

  // Slim, client-safe rows for the program sheet (no counts).
  const weekTaskRows = weekRows.map((t) => ({
    id: t.id,
    title: t.title,
    task_type: t.task_type,
    course_id: t.course_id,
    task_date: t.task_date,
    status: t.status,
    order_index: t.order_index,
  }));
  // LGS parents only: yesterday..tomorrow rows for the Dün/Bugün/Yarın bars.
  const dailyRowData = isLgsStudent ? inRange(addDays(today, -1), addDays(today, 1)) : [];

  const programTasks = weekTaskRows as unknown as ProgramTask[];
  // All-time count of every outcome='completed' session, no date/cycle filter --
  // this used to stop at quota_cycle_start_at (the point of the student's last
  // quota renewal), which was correct for driving the old
  // auto_unassign_on_quota_completion trigger, but that trigger was DROPPED in
  // 0084 (coaching_sessions.is_paid), and nothing else in this app still needs
  // "completed since the last renewal" specifically. Cycle-scoping it also
  // silently hid any session backdated before quota_cycle_start_at (e.g. a
  // coach backfilling historical sessions predating their quota cycle) from
  // this count -- a parent reading "2 tamamlandı" for a student with 11 real
  // completed sessions. This now matches remaining/sessionBalance below, which
  // was already all-time.
  const completedCount = sessions.filter((s) => s.outcome === "completed").length;

  const weekStat = sumWeekStats((dailyStatsRows ?? []).map((r) => ({ total: r.total_count })));

  const exams = (examRows ?? []) as GeneralExam[];
  const tytNetChartData = netChartFor(exams.filter((e) => parseGeneralExamTrack(e.title) === "tyt"));
  const aytNetChartData = netChartFor(exams.filter((e) => parseGeneralExamTrack(e.title) === "ayt"));
  // Only exams with a complete, valid result set (every subject's Doğru/Yanlış/Boş)
  // reach the chart -- a half-entered exam never plots a misleading net.
  const lgsNetChartData = netChartFor(
    exams.filter(
      (e) => parseGeneralExamTrack(e.title) === "lgs" && !isGeneralExamScoresIncomplete(e.title, e.subject_scores as never),
    ),
    computeLgsNet,
  );

  // Only ever populated for an LGS student (see the batch above).
  const dailyRows: DailyProgressTask[] = isLgsParentView(profile.exam_type, profile.is_maarif7) ? (dailyRowData as unknown as DailyProgressTask[]) : [];

  return {
    today,
    dailyRows,
    student: profile,
    totalQuota: profile.total_session_quota,
    completedCount,
    // Paid minus completed, negative allowed (same rule as the student
    // panel, lib/session-balance.ts) -- a completed session the coach
    // logged always lowers this by one, even when it was never marked
    // paid, instead of being clamped away at 0.
    remaining: sessionBalance(sessions).remaining,
    unpaidCompleted: sessionBalance(sessions).unpaidCompleted,
    sessions,
    // The student's own coaching cycle (see lib/completion.ts), not this
    // calendar week -- "currentWeek"/"previousWeek" name what they feed
    // (WeeklyProgressCard's two rows), not a Monday-Sunday range.
    currentWeek: { ...currentCycle, pct: completionPercent(weightedCycleCounts(windowRows, currentCycle)) },
    previousWeek: { ...previousCycle, pct: completionPercent(weightedCycleCounts(windowRows, previousCycle)) },
    weekStat,
    programTasks,
    tytNetChartData,
    aytNetChartData,
    lgsNetChartData,
    examType: (profile.exam_type ?? "YKS") as "YKS" | "LGS",
    // LGS-style program view (Dün/Bugün/Yarın bars, Tam Program): LGS students and 7th graders.
    programView: isLgsParentView(profile.exam_type, profile.is_maarif7),
  };
}

export default async function ParentPage() {
  const data = await fetchDashboardData();

  if (!data || !data.student) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="text-2xl font-semibold text-foreground">Veli Paneli</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          Hesabınız henüz bir öğrenciyle ilişkilendirilmemiş. Lütfen yönetici ile iletişime geçin.
        </p>
      </div>
    );
  }

  const {
    today: todayIso,
    dailyRows,
    student,
    totalQuota,
    completedCount,
    remaining,
    unpaidCompleted,
    sessions,
    currentWeek,
    previousWeek,
    weekStat,
    programTasks,
    tytNetChartData,
    aytNetChartData,
    lgsNetChartData,
    examType,
    programView,
  } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {programView && <AutoRefresh />}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{student.full_name ?? "Öğrenci"}</h1>
          <SessionQuotaStats completed={completedCount} total={totalQuota} remaining={remaining} unpaidCompleted={unpaidCompleted} />
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              student.is_active
                ? "bg-emerald-500/15 text-emerald-700 rounded-full px-2.5 py-1 text-xs font-medium"
                : "bg-rose-500/15 text-rose-700 rounded-full px-2.5 py-1 text-xs font-medium"
            }
          >
            {student.is_active ? "Aktif" : "Pasif"}
          </span>
          {!programView && <WeeklyProgramSheet tasks={programTasks} />}
        </div>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Haftalık Program Tamamlama</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyProgressCard previous={previousWeek} current={currentWeek} />
          </CardContent>
        </Card>

        {programView && (
          <DailyProgressCard tasks={dailyRows} today={todayIso} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kaynak Takibi</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyStatsSummary stat={weekStat} />
          </CardContent>
        </Card>

        {examType === "LGS" ? (
          // An LGS student's parent sees only LGS's own exam chart -- never
          // the TYT/AYT ones (and its net is LGS's 3:1, not YKS's 4:1).
          <Card>
            <CardHeader>
              <CardTitle className="text-base">LGS Genel Deneme</CardTitle>
              <CardDescription>Tüm derslerin toplamı üzerinden net değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart data={lgsNetChartData} />
            </CardContent>
          </Card>
        ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">TYT Genel Deneme</CardTitle>
              <CardDescription>Tüm derslerin toplamı üzerinden net değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart data={tytNetChartData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AYT Genel Deneme</CardTitle>
              <CardDescription>Tüm derslerin toplamı üzerinden net değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart data={aytNetChartData} />
            </CardContent>
          </Card>
        </div>
        )}

        <section>
          <h2 className="text-foreground mb-3 text-base font-semibold">Görüşmeler</h2>
          <SessionCalendar sessions={sessions} />
        </section>
      </div>
    </div>
  );
}
