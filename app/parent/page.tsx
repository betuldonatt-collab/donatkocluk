import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeLgsNet, computeNet } from "@/lib/scoring";
import { mondayOf } from "@/lib/date";
import { completionPercent, weekCompletionCounts } from "@/lib/completion";
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
function parseGeneralExamTrack(title: string): "tyt" | "ayt" | "lgs" {
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

type WeekTask = { task_date: string; status: "pending" | "done" | "half_done" | "not_done" };

// Whole-week (macro) completion, same rule as the student's "Bu Hafta" bar.
// Counts only what is due so far this week (from the day the schedule was locked,
// Monday if not locked, up to today): tomorrow's tasks are in neither the numerator
// nor the denominator (lib/completion.ts).
function computeWeeklyCompletionPct(tasks: WeekTask[], today: string, lockedAt: string | null) {
  return completionPercent(weekCompletionCounts(tasks, today, lockedAt));
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const studentId = await getActiveStudentId();
  if (!studentId) return { student: null };

  const today = todayISO();
  const { start, end } = getWeekRange(today);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(start, -1);

  const [
    { data: profile },
    { data: sessionRows },
    { data: weekTaskRows },
    { data: dailyStatsRows },
    { data: examRows },
    { data: weekLockRow },
    { data: prevTaskRows },
    { data: prevLockRow },
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, is_active, total_session_quota, quota_cycle_start_at, exam_type")
        .eq("id", studentId)
        .maybeSingle(),
      supabase
        .from("coaching_sessions")
        .select("id, scheduled_at, outcome, is_paid")
        .eq("student_id", studentId)
        .order("scheduled_at", { ascending: false }),
      // Security audit finding: total_count/correct_count/wrong_count used
      // to be selected here too, even though neither consumer below
      // (computeWeeklyCompletionPct only reads status; WeeklyProgramSheet
      // only reads title/task_type/course_id/status) ever displays them.
      // WeeklyProgramSheet is a "use client" component -- Next.js must
      // serialize every prop crossing that boundary, so the raw per-task
      // scores were reaching the parent's browser in the page's RSC
      // payload regardless of what the component's own JSX rendered,
      // inspectable via devtools even with the UI showing only a status
      // badge. Selecting only what's actually used closes that at the
      // source instead of fetching-then-hiding it.
      supabase
        .from("student_tasks")
        .select("id, title, task_type, course_id, task_date, status, order_index")
        .eq("student_id", studentId)
        .gte("task_date", start)
        .lte("task_date", end)
        .order("task_date", { ascending: true })
        .order("order_index", { ascending: true }),
      // Softened per product decision: the parent view only ever shows a
      // "Toplam Çözülen Soru" total now, never the Doğru/Yanlış/Boş
      // breakdown (see WeeklyStatsSummary) -- correct/wrong/empty aren't
      // selected here at all anymore, for the same "don't fetch what you
      // don't render" reasoning as the student_tasks query above.
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
      // When this week's schedule was locked: where the weekly completion starts counting.
      supabase.from("week_locks").select("locked_at").eq("student_id", studentId).eq("week_start_date", start).maybeSingle(),
      // Last full week: a finished baseline shown next to the ongoing one.
      supabase
        .from("student_tasks")
        .select("task_date, status")
        .eq("student_id", studentId)
        .gte("task_date", prevStart)
        .lte("task_date", prevEnd),
      supabase.from("week_locks").select("locked_at").eq("student_id", studentId).eq("week_start_date", prevStart).maybeSingle(),
    ]);

  if (!profile) return { student: null };

  const sessions = (sessionRows ?? []) as ParentSession[];
  const weekTasks = (weekTaskRows ?? []) as WeekTask[];
  const programTasks = (weekTaskRows ?? []) as ProgramTask[];
  // Scoped to the current quota cycle, same reset point + condition
  // (outcome = 'completed' and scheduled_at >= quota_cycle_start_at) as
  // auto_unassign_on_quota_completion (0035_audit_fixes.sql) -- otherwise
  // this reads as an all-time historical total instead of "how many of
  // THIS assigned quota are done", diverging from what actually drives
  // the auto-unassign behavior.
  const cycleStart = profile.quota_cycle_start_at as string;
  const completedCount = sessions.filter((s) => s.outcome === "completed" && s.scheduled_at >= cycleStart).length;

  const weekStat = sumWeekStats((dailyStatsRows ?? []).map((r) => ({ total: r.total_count })));

  const exams = (examRows ?? []) as GeneralExam[];
  const tytNetChartData = netChartFor(exams.filter((e) => parseGeneralExamTrack(e.title) === "tyt"));
  const aytNetChartData = netChartFor(exams.filter((e) => parseGeneralExamTrack(e.title) === "ayt"));
  const lgsNetChartData = netChartFor(
    exams.filter((e) => parseGeneralExamTrack(e.title) === "lgs"),
    computeLgsNet,
  );

  return {
    student: profile,
    totalQuota: profile.total_session_quota,
    completedCount,
    remaining: Math.max(0, profile.total_session_quota - completedCount),
    sessions,
    currentWeek: {
      start,
      end,
      pct: computeWeeklyCompletionPct(weekTasks, today, (weekLockRow?.locked_at ?? null) as string | null),
    },
    previousWeek: {
      start: prevStart,
      end: prevEnd,
      pct: computeWeeklyCompletionPct((prevTaskRows ?? []) as WeekTask[], prevStart, (prevLockRow?.locked_at ?? null) as string | null),
    },
    weekStat,
    programTasks,
    tytNetChartData,
    aytNetChartData,
    lgsNetChartData,
    examType: (profile.exam_type ?? "YKS") as "YKS" | "LGS",
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
    student,
    totalQuota,
    completedCount,
    remaining,
    sessions,
    currentWeek,
    previousWeek,
    weekStat,
    programTasks,
    tytNetChartData,
    aytNetChartData,
    lgsNetChartData,
    examType,
  } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{student.full_name ?? "Öğrenci"}</h1>
          <SessionQuotaStats completed={completedCount} total={totalQuota} remaining={remaining} />
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
          <WeeklyProgramSheet tasks={programTasks} />
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
