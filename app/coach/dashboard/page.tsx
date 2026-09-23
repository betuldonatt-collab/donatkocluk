import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { weekDates } from "@/lib/date";
import {
  getPendingFocusReviews,
  getPendingStudentTasks,
  syncPendingApprovalNotifications,
  type PendingFocusReview,
  type PendingStudentTask,
} from "../actions";
import { DashboardClient } from "./dashboard-client";
import { WeekNavigator } from "./_components/week-navigator";
import type {
  CoachAlerts,
  CoachingSession,
  CalendarBlock,
  CoachTask,
  MissingExamAlert,
  PendingReportCardAlert,
  RosterStudent,
  RsvpDeclineAlert,
} from "./types";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Any date within the target week works, not just its Monday, since
// Prev/Next and the date picker just pass along whatever date the coach
// navigated to.
function getWeekDays(referenceIso: string) {
  return weekDates(referenceIso).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[i]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

function isValidDateString(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoTimestampDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

// Pure aggregation over the roster + already-scoped task rows into the
// dashboard's 4 alert buckets. Kept separate from the fetch so the query
// shape and the bucketing logic can each be read on their own.
function buildCoachAlerts(
  roster: RosterStudent[],
  recentActivityRows: { student_id: string; updated_at: string; created_at: string }[],
  prevWeekTaskRows: { student_id: string; status: string }[],
  missingExamRows: {
    id: string;
    student_id: string;
    task_type: string;
    task_date: string;
    title: string;
    course_id: string | null;
    total_count: number | null;
    correct_count: number | null;
    wrong_count: number | null;
    empty_count: number | null;
    subject_scores: MissingExamAlert["subjectScores"];
  }[],
  currentWeekTaskRows: { student_id: string }[],
  pendingReportCardRows: { id: string; student_id: string; cycle_number: number; generated_at: string }[],
  rsvpDeclineRows: { id: string; student_id: string; decline_reason: string | null; announcements: { title: string } | { title: string }[] | null }[],
): CoachAlerts {
  const rosterById = new Map(roster.map((s) => [s.id, s]));

  // A row only counts as genuine activity if it was touched after creation
  // -- a freshly-assigned, never-opened task inserts with updated_at ===
  // created_at and shouldn't count as the student being "active".
  const activeIds = new Set(
    recentActivityRows
      .filter((r) => new Date(r.updated_at).getTime() !== new Date(r.created_at).getTime())
      .map((r) => r.student_id),
  );
  const inactive = roster.filter((s) => !activeIds.has(s.id)).map((student) => ({ student }));

  const prevWeekBuckets = new Map<string, { done: number; total: number }>();
  for (const r of prevWeekTaskRows) {
    const b = prevWeekBuckets.get(r.student_id) ?? { done: 0, total: 0 };
    b.total += 1;
    if (r.status === "done") b.done += 1;
    prevWeekBuckets.set(r.student_id, b);
  }
  const lowPerformance = roster.flatMap((student) => {
    const b = prevWeekBuckets.get(student.id);
    if (!b || b.total === 0) return [];
    const completionPct = Math.round((b.done / b.total) * 100);
    return completionPct < 50 ? [{ student, completionPct, doneCount: b.done, totalCount: b.total }] : [];
  });

  // The query already scopes this to analysis_pending = true (the same
  // flag the student's own "Analiz Bekliyor" reminder and TaskModal's
  // analysis flow set/clear) -- so every row here genuinely is "declared
  // solved, analysis not done yet", not a heuristic guess off null counts.
  const missingExams = missingExamRows
    .map((r) => ({
      student: rosterById.get(r.student_id),
      taskId: r.id,
      title: r.title,
      taskDate: r.task_date,
      taskType: r.task_type as "general_exam" | "branch_exam",
      courseId: r.course_id,
      totalCount: r.total_count,
      correctCount: r.correct_count,
      wrongCount: r.wrong_count,
      emptyCount: r.empty_count,
      subjectScores: r.subject_scores,
    }))
    .filter((a): a is MissingExamAlert => !!a.student);

  const weekActiveIds = new Set(currentWeekTaskRows.map((r) => r.student_id));
  const emptyPrograms = roster.filter((s) => !weekActiveIds.has(s.id)).map((student) => ({ student }));

  const pendingReportCards = pendingReportCardRows
    .map((r) => ({
      student: rosterById.get(r.student_id),
      reportCardId: r.id,
      cycleNumber: r.cycle_number,
      generatedAt: r.generated_at,
    }))
    .filter((a): a is PendingReportCardAlert => !!a.student);

  const rsvpDeclines = rsvpDeclineRows
    .map((r) => {
      const announcement = Array.isArray(r.announcements) ? r.announcements[0] : r.announcements;
      return {
        student: rosterById.get(r.student_id),
        rsvpId: r.id,
        announcementTitle: announcement?.title ?? "Duyuru",
        declineReason: r.decline_reason,
      };
    })
    .filter((a): a is RsvpDeclineAlert => !!a.student);

  return { inactive, lowPerformance, missingExams, emptyPrograms, pendingReportCards, rsvpDeclines };
}

async function fetchDashboardData(
  coachId: string,
  today: string,
  weekDays: { date: string; label: string }[],
) {
  const supabase = await createClient();
  const weekStart = `${weekDays[0].date}T00:00:00Z`;
  const weekEndExclusive = new Date(`${weekDays[6].date}T00:00:00Z`);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);

  const [
    { data: rosterLinks },
    { data: bannerSessionRows },
    { data: weekSessionRows },
    { data: weekBlockRows },
    { data: weekTaskRows },
    { data: pendingReportCardRows },
  ] =
    await Promise.all([
      supabase.from("coach_students").select("student_id").eq("coach_id", coachId),
      // The banner always reflects the earliest un-evaluated session
      // overall -- independent of which week is currently being viewed
      // on the calendar below it.
      supabase
        .from("coaching_sessions")
        .select("*")
        .eq("coach_id", coachId)
        .eq("outcome", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(1),
      supabase
        .from("coaching_sessions")
        .select("*")
        .eq("coach_id", coachId)
        .gte("scheduled_at", weekStart)
        .lt("scheduled_at", weekEndExclusive.toISOString())
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("coach_calendar_blocks")
        .select("*")
        .eq("coach_id", coachId)
        .gte("start_at", weekStart)
        .lt("start_at", weekEndExclusive.toISOString())
        .order("start_at", { ascending: true }),
      supabase
        .from("coach_tasks")
        .select("*")
        .eq("coach_id", coachId)
        .gte("task_date", weekDays[0].date)
        .lte("task_date", weekDays[6].date)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_report_cards")
        .select("id, student_id, cycle_number, generated_at")
        .eq("coach_id", coachId)
        .eq("status", "draft"),
    ]);

  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);

  // The alert panel is a persistent status view, independent of whichever
  // week the coach has navigated the calendar to above -- always anchored
  // to today's real current/previous week, computed separately from the
  // `weekDays` the ?week= param drives.
  const todayWeek = getWeekDays(today);
  const prevWeekMonday = addDaysISO(todayWeek[0].date, -7);
  const prevWeekSunday = addDaysISO(todayWeek[0].date, -1);

  const [
    { data: profiles },
    { data: recentActivityRows },
    { data: prevWeekTaskRows },
    { data: missingExamRows },
    { data: currentWeekTaskRows },
    { data: rsvpDeclineRows },
  ] =
    studentIds.length > 0
      ? await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", studentIds),
          supabase
            .from("student_tasks")
            .select("student_id, updated_at, created_at")
            .in("student_id", studentIds)
            .gte("updated_at", isoTimestampDaysAgo(3)),
          supabase
            .from("student_tasks")
            .select("student_id, status")
            .in("student_id", studentIds)
            .gte("task_date", prevWeekMonday)
            .lte("task_date", prevWeekSunday),
          // analysis_pending is the exact same flag the student side sets
          // (task-modal.tsx) and clears (only once the topic-mistake
          // analysis step is actually completed, by the student OR now by
          // the coach via saveCoachTrialResults) -- no date window here,
          // matching the student's own unbounded "Analiz Bekliyor" list
          // (app/student/page.tsx): a still-pending analysis stays
          // reportable regardless of how long ago the exam was solved.
          supabase
            .from("student_tasks")
            .select("id, student_id, task_type, task_date, title, course_id, total_count, correct_count, wrong_count, empty_count, subject_scores")
            .in("student_id", studentIds)
            .in("task_type", ["general_exam", "branch_exam"])
            .eq("analysis_pending", true)
            .order("task_date", { ascending: true }),
          supabase
            .from("student_tasks")
            .select("student_id")
            .in("student_id", studentIds)
            .gte("task_date", todayWeek[0].date)
            .lte("task_date", todayWeek[6].date),
          supabase
            .from("announcement_rsvps")
            .select("id, student_id, decline_reason, announcements!inner(title, is_active)")
            .in("student_id", studentIds)
            .eq("response", "not_attending")
            .eq("announcements.is_active", true),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const roster = (profiles ?? []) as RosterStudent[];
  const alerts = buildCoachAlerts(
    roster,
    recentActivityRows ?? [],
    prevWeekTaskRows ?? [],
    missingExamRows ?? [],
    currentWeekTaskRows ?? [],
    pendingReportCardRows ?? [],
    rsvpDeclineRows ?? [],
  );

  return {
    roster,
    bannerSession: (bannerSessionRows?.[0] ?? null) as CoachingSession | null,
    weekSessions: (weekSessionRows ?? []) as CoachingSession[],
    weekBlocks: (weekBlockRows ?? []) as CalendarBlock[],
    weekTasks: (weekTaskRows ?? []) as CoachTask[],
    alerts,
  };
}

export default async function CoachDashboardPage(props: PageProps<"/coach/dashboard">) {
  const searchParams = await props.searchParams;
  const weekParam = Array.isArray(searchParams.week) ? searchParams.week[0] : searchParams.week;

  const today = todayISO();
  const referenceDate = isValidDateString(weekParam) ? weekParam : today;
  const weekDays = getWeekDays(referenceDate);
  const isCurrentWeek = weekDays.some((d) => d.date === today);

  const view = await getViewContext("coach");

  const emptyDashboard: [
    {
      roster: RosterStudent[];
      bannerSession: CoachingSession | null;
      weekSessions: CoachingSession[];
      weekBlocks: CalendarBlock[];
      weekTasks: CoachTask[];
      alerts: CoachAlerts;
    },
    (PendingStudentTask & { studentId: string; studentName: string | null })[],
    PendingFocusReview[],
  ] = [
    {
      roster: [],
      bannerSession: null,
      weekSessions: [],
      weekBlocks: [],
      weekTasks: [],
      alerts: { inactive: [], lowPerformance: [], missingExams: [], emptyPrograms: [], pendingReportCards: [], rsvpDeclines: [] },
    },
    [],
    [],
  ];

  // Next.js implicitly re-renders whichever page a Server Action was
  // invoked FROM once that action resolves (e.g. any cookie write inside
  // it -- see lib/supabase/server.ts's createClient, which writes a
  // refreshed auth cookie whenever the session token happens to be near
  // expiry -- triggers this). The dashboard is exactly that page for the
  // "Analizi öğrenci yerine yap" action: a coach can spend several
  // minutes marking up a full LGS Genel Deneme's topic list before
  // hitting Kaydet, which is plenty of time for a due token refresh to
  // land mid-save. If THIS re-render throws for any reason (a transient
  // Supabase hiccup, a connection-pool limit under concurrent load, or a
  // genuine bug), Next.js redacts the message and the coach's own Server
  // Action promise rejects with an opaque "Minified React error" instead
  // of resolving -- even though their save may have already gone through.
  // Falling back to an empty-but-valid dashboard render here means a
  // transient failure in THIS fetch can no longer take the whole RSC
  // response down with it.
  let data = emptyDashboard[0];
  let pendingApprovals = emptyDashboard[1];
  let focusReviews = emptyDashboard[2];
  if (view) {
    try {
      [data, pendingApprovals, focusReviews] = await Promise.all([
        fetchDashboardData(view.effectiveUserId, today, weekDays),
        getPendingStudentTasks(),
        getPendingFocusReviews(),
      ]);
    } catch (e) {
      console.error("[CoachDashboardPage] fetchDashboardData failed", e);
    }
  }

  // Notification-side echo of the pending-approvals card above -- see
  // syncPendingApprovalNotifications' own comment (app/coach/actions.ts).
  // Generating notifications is a write, so (matching every other write
  // on this page/layout, e.g. touchCoachPresence) it never runs while
  // impersonating.
  if (view && !view.isImpersonating) {
    await syncPendingApprovalNotifications(pendingApprovals);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Koç Paneli</h1>
        <p className="text-muted-foreground text-sm">Görüşmelerini yönet, haftalık takvimini ve günlük görevlerini takip et.</p>
      </header>

      <div className="mb-4">
        <WeekNavigator weekStart={weekDays[0].date} weekEnd={weekDays[6].date} isCurrentWeek={isCurrentWeek} />
      </div>

      {/* DashboardClient seeds its local state from these props via
          useState, which only runs on mount -- keying on the viewed
          week's Monday forces a fresh mount (and fresh local state) each
          time the coach navigates to a different week. */}
      <DashboardClient key={weekDays[0].date} today={today} weekDays={weekDays} pendingApprovals={pendingApprovals} focusReviews={focusReviews} {...data} />
    </div>
  );
}
