import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { EXIT_CATEGORY_LABELS, type ExitCategory } from "@/lib/exit-category";
import type { CoachingSession } from "../dashboard/types";
import { StatCards } from "./_components/stat-cards";
import { CategoryBreakdown } from "./_components/category-breakdown";
import { MonthNavigator } from "./_components/month-navigator";
import { PastStudentsTable } from "./_components/past-students-table";
import type { CoachStats } from "./types";

type StudentProfileRow = {
  id: string;
  full_name: string | null;
  is_active: boolean;
  exit_category: ExitCategory | null;
  exit_note: string | null;
  exited_at: string | null;
  coaching_start_date: string | null;
};

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

function monthsBetween(startIso: string, endIso: string): number {
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, diff / MS_PER_MONTH);
}

async function fetchStatsData(coachId: string) {
  const supabase = await createClient();

  const [{ data: rosterLinks }, { data: sessionRows }] = await Promise.all([
    supabase.from("coach_students").select("student_id, created_at").eq("coach_id", coachId),
    supabase.from("coaching_sessions").select("*").eq("coach_id", coachId),
  ]);

  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  const { data: profileRows } =
    studentIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, is_active, exit_category, exit_note, exited_at, coaching_start_date")
          .in("id", studentIds)
      : { data: [] };

  return {
    links: rosterLinks ?? [],
    profiles: (profileRows ?? []) as StudentProfileRow[],
    sessions: (sessionRows ?? []) as CoachingSession[],
  };
}

function computeStats(
  links: { student_id: string; created_at: string }[],
  profiles: StudentProfileRow[],
  // Retention/churn/past-student figures are current-state, lifetime
  // facts (e.g. "average months retained") -- they stay scoped to ALL
  // sessions regardless of the selected month, since "active students in
  // March" isn't a coherent concept. Only workload/rating are scoped to
  // monthSessions, matching the Görüşmelerim page's own per-month view.
  allSessions: CoachingSession[],
  monthSessions: CoachingSession[],
  now: string,
): CoachStats {
  const linkedSince = new Map(links.map((l) => [l.student_id, l.created_at]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  let activeCount = 0;
  let inactiveCount = 0;
  const retentionMonths: number[] = [];
  const pastStudents: CoachStats["pastStudents"] = [];
  const churnCounts = new Map<string, number>();

  const completedByStudent = new Map<string, number>();
  for (const s of allSessions) {
    if (s.outcome !== "completed") continue;
    completedByStudent.set(s.student_id, (completedByStudent.get(s.student_id) ?? 0) + 1);
  }

  for (const [studentId, createdAt] of linkedSince) {
    const profile = profileById.get(studentId);
    if (!profile) continue;

    const start = profile.coaching_start_date ?? createdAt;
    const end = profile.is_active ? now : (profile.exited_at ?? now);
    const months = monthsBetween(start, end);
    retentionMonths.push(months);

    if (profile.is_active) {
      activeCount += 1;
    } else {
      inactiveCount += 1;
      const key = profile.exit_category ?? "unspecified";
      churnCounts.set(key, (churnCounts.get(key) ?? 0) + 1);
      pastStudents.push({
        id: profile.id,
        full_name: profile.full_name,
        stayMonths: Math.round(months * 10) / 10,
        completedSessions: completedByStudent.get(studentId) ?? 0,
        exitCategory: profile.exit_category,
        exitNote: profile.exit_note,
      });
    }
  }

  const avgRetentionMonths =
    retentionMonths.length > 0
      ? Math.round((retentionMonths.reduce((sum, m) => sum + m, 0) / retentionMonths.length) * 10) / 10
      : null;

  // Kept lifetime (allSessions), matching its own "Genel Memnuniyet Puanı"
  // label -- only workload (below) is the month-scoped figure.
  const ratings = allSessions.filter((s) => s.student_rating != null).map((s) => s.student_rating!);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10 : null;

  const workload = {
    pending: monthSessions.filter((s) => s.outcome === "pending").length,
    completed: monthSessions.filter((s) => s.outcome === "completed").length,
    notHappened: monthSessions.filter((s) => s.outcome === "not_happened").length,
    total: monthSessions.length,
  };

  const churnOrder: (ExitCategory | "unspecified")[] = [
    "graduated",
    "grade_transition",
    "financial",
    "motivation",
    "system",
    "unspecified",
  ];
  const churnBreakdown = churnOrder
    .map((category) => ({
      category,
      label: category === "unspecified" ? "Belirtilmedi" : EXIT_CATEGORY_LABELS[category],
      count: churnCounts.get(category) ?? 0,
    }))
    .filter((c) => c.count > 0);

  pastStudents.sort((a, b) => b.stayMonths - a.stayMonths);

  return {
    activeCount,
    inactiveCount,
    avgRetentionMonths,
    avgRating,
    ratingCount: ratings.length,
    workload,
    churnBreakdown,
    pastStudents,
  };
}

function isValidMonthString(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}-01T00:00:00Z`).getTime());
}

export default async function CoachStatsPage(props: PageProps<"/coach/stats">) {
  const searchParams = await props.searchParams;
  const monthParam = Array.isArray(searchParams.month) ? searchParams.month[0] : searchParams.month;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = isValidMonthString(monthParam) ? monthParam : currentMonth;

  const view = await getViewContext("coach");

  const now = new Date().toISOString();
  const { links, profiles, sessions } = view
    ? await fetchStatsData(view.effectiveUserId)
    : { links: [], profiles: [] as StudentProfileRow[], sessions: [] as CoachingSession[] };

  const monthSessions = sessions.filter((s) => s.scheduled_at.slice(0, 7) === month);
  const stats = computeStats(links, profiles, sessions, monthSessions, now);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">İstatistiklerim</h1>
        <p className="text-muted-foreground text-sm">
          Öğrenci kalıcılığı, memnuniyet ve ayrılış eğilimlerine genel bakış.
        </p>
      </header>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNavigator month={month} isCurrentMonth={month === currentMonth} />
          <p className="text-muted-foreground text-xs">
            Operasyonel iş yükü seçilen aya göre; diğer kartlar her zaman güncel/tüm zamanlar durumuna göre hesaplanır.
          </p>
        </div>
        <StatCards stats={stats} />
        <CategoryBreakdown items={stats.churnBreakdown} inactiveCount={stats.inactiveCount} />
        <PastStudentsTable students={stats.pastStudents} />
      </div>
    </div>
  );
}
