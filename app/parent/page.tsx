import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeNet } from "@/lib/scoring";
import { mondayOf } from "@/lib/date";
import { CompletionBar } from "./_components/completion-bar";
import { LineChart } from "./_components/line-chart";
import { SessionCalendar, type ParentSession } from "./_components/session-calendar";
import { WeeklyStatsSummary, type WeekStat } from "./_components/weekly-stats-summary";
import { WeeklyProgramSheet, type ProgramTask } from "./_components/weekly-program-sheet";

type SubjectScores = Record<string, { correct?: number; wrong?: number }>;
type GeneralExam = { id: string; title: string; task_date: string; subject_scores: SubjectScores | null };

// General-exam tasks have no course_id -- the TYT/AYT track lives only in
// the title text, same convention the student/coach panels already parse.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" {
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

// Overall net = sum of correct/wrong across all subjects, netted once on
// the totals (not summed per-subject net) so rounding never compounds.
// Unlike the student's own Genel Analiz page, this doesn't split AYT by
// track (sayısal/EA/sözel/YDT) -- the parent view just wants one line per
// exam type, not the track-selector complexity.
function netChartFor(exams: GeneralExam[]) {
  return exams
    .filter((e) => e.subject_scores)
    .slice()
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
    .map((e) => {
      const totals = Object.values(e.subject_scores!).reduce<{ correct: number; wrong: number }>(
        (acc, s) => ({ correct: acc.correct + (s.correct ?? 0), wrong: acc.wrong + (s.wrong ?? 0) }),
        { correct: 0, wrong: 0 },
      );
      return { date: e.task_date, value: computeNet(totals.correct, totals.wrong) };
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

type WeekTask = { status: "pending" | "done" | "half_done" | "not_done" };

function computeWeeklyCompletionPct(tasks: WeekTask[]) {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "done").length;
  return Math.round((done / tasks.length) * 100);
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

  const [{ data: profile }, { data: sessionRows }, { data: weekTaskRows }, { data: dailyStatsRows }, { data: examRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, is_active, total_session_quota")
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
    ]);

  if (!profile) return { student: null };

  const sessions = (sessionRows ?? []) as ParentSession[];
  const weekTasks = (weekTaskRows ?? []) as WeekTask[];
  const programTasks = (weekTaskRows ?? []) as ProgramTask[];
  const completedCount = sessions.filter((s) => s.outcome === "completed").length;

  const weekStat = sumWeekStats((dailyStatsRows ?? []).map((r) => ({ total: r.total_count })));

  const exams = (examRows ?? []) as GeneralExam[];
  const tytNetChartData = netChartFor(exams.filter((e) => parseGeneralExamTrack(e.title) === "tyt"));
  const aytNetChartData = netChartFor(exams.filter((e) => parseGeneralExamTrack(e.title) === "ayt"));

  return {
    student: profile,
    totalQuota: profile.total_session_quota,
    completedCount,
    remaining: Math.max(0, profile.total_session_quota - completedCount),
    sessions,
    weeklyCompletionPct: computeWeeklyCompletionPct(weekTasks),
    weekStat,
    programTasks,
    tytNetChartData,
    aytNetChartData,
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
    weeklyCompletionPct,
    weekStat,
    programTasks,
    tytNetChartData,
    aytNetChartData,
  } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{student.full_name ?? "Öğrenci"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Toplam Görüşme: {totalQuota} | Tamamlanan: {completedCount} | Kalan: {remaining}
          </p>
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
            <CardTitle className="text-base">Bu Hafta Program Tamamlama</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionBar label="Genel" pct={weeklyCompletionPct} />
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

        <section>
          <h2 className="text-foreground mb-3 text-base font-semibold">Görüşmeler</h2>
          <SessionCalendar sessions={sessions} />
        </section>
      </div>
    </div>
  );
}
