import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { weekDates } from "@/lib/date";
import type { RosterStudent } from "../dashboard/types";
import { NotificationsClient } from "./_components/notifications-client";
import type { CoachNotification, NotificationType } from "./types";

type CoachSettingsRow = {
  inactivity_threshold_days: number;
  critical_completion_threshold_pct: number;
  success_alert_enabled: boolean;
};

const DEFAULT_SETTINGS: CoachSettingsRow = {
  inactivity_threshold_days: 3,
  critical_completion_threshold_pct: 50,
  success_alert_enabled: true,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function completionBucket(rows: { student_id: string; status: string }[]) {
  const buckets = new Map<string, { done: number; total: number }>();
  for (const r of rows) {
    const b = buckets.get(r.student_id) ?? { done: 0, total: 0 };
    b.total += 1;
    if (r.status === "done") b.done += 1;
    buckets.set(r.student_id, b);
  }
  return buckets;
}

// Generates fresh threshold-based notifications (inactive / critical drop /
// 100% success) using the coach's own configured thresholds, deduped so a
// still-ongoing condition doesn't spam a new row on every page visit: skip
// if a notification of that (student, type) already exists and is either
// still active, or was marked done earlier TODAY.
async function syncThresholdNotifications(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  roster: RosterStudent[],
  settings: CoachSettingsRow,
) {
  if (roster.length === 0) return;
  const studentIds = roster.map((s) => s.id);
  const today = todayISO();

  const { data: recentRows } = await supabase
    .from("notifications")
    .select("student_id, type, status, done_at")
    .eq("coach_id", coachId)
    .in("type", ["inactive_student", "critical_completion_drop", "success_completion"])
    .gte("created_at", isoTimestampDaysAgo(2));

  function hasRecent(studentId: string, type: NotificationType) {
    return (recentRows ?? []).some(
      (r) =>
        r.student_id === studentId &&
        r.type === type &&
        (r.status === "active" || (r.status === "done" && r.done_at?.slice(0, 10) === today)),
    );
  }

  const todayWeek = weekDates(today);
  const prevWeekMonday = addDaysISO(todayWeek[0], -7);
  const prevWeekSunday = addDaysISO(todayWeek[0], -1);

  const [{ data: activityRows }, { data: prevWeekRows }, { data: currentWeekRows }] = await Promise.all([
    supabase
      .from("student_tasks")
      .select("student_id, updated_at, created_at")
      .in("student_id", studentIds)
      .gte("updated_at", isoTimestampDaysAgo(settings.inactivity_threshold_days)),
    supabase
      .from("student_tasks")
      .select("student_id, status")
      .in("student_id", studentIds)
      .gte("task_date", prevWeekMonday)
      .lte("task_date", prevWeekSunday),
    supabase
      .from("student_tasks")
      .select("student_id, status")
      .in("student_id", studentIds)
      .gte("task_date", todayWeek[0])
      .lte("task_date", todayWeek[6]),
  ]);

  const activeIds = new Set(
    (activityRows ?? [])
      .filter((r) => new Date(r.updated_at).getTime() !== new Date(r.created_at).getTime())
      .map((r) => r.student_id),
  );
  const prevWeekBuckets = completionBucket(prevWeekRows ?? []);
  const currentWeekBuckets = completionBucket(currentWeekRows ?? []);

  const toInsert: {
    coach_id: string;
    student_id: string;
    type: NotificationType;
    title: string;
    status: "active";
  }[] = [];

  for (const student of roster) {
    const name = student.full_name ?? "Öğrenci";

    if (!activeIds.has(student.id) && !hasRecent(student.id, "inactive_student")) {
      toInsert.push({
        coach_id: coachId,
        student_id: student.id,
        type: "inactive_student",
        title: `${name} ${settings.inactivity_threshold_days} gündür aktif değil`,
        status: "active",
      });
    }

    const prevBucket = prevWeekBuckets.get(student.id);
    if (prevBucket && prevBucket.total > 0) {
      const pct = Math.round((prevBucket.done / prevBucket.total) * 100);
      if (pct < settings.critical_completion_threshold_pct && !hasRecent(student.id, "critical_completion_drop")) {
        toInsert.push({
          coach_id: coachId,
          student_id: student.id,
          type: "critical_completion_drop",
          title: `${name} haftalık tamamlama oranı %${pct}'e düştü`,
          status: "active",
        });
      }
    }

    if (settings.success_alert_enabled) {
      const curBucket = currentWeekBuckets.get(student.id);
      if (
        curBucket &&
        curBucket.total > 0 &&
        curBucket.done === curBucket.total &&
        !hasRecent(student.id, "success_completion")
      ) {
        toInsert.push({
          coach_id: coachId,
          student_id: student.id,
          type: "success_completion",
          title: `${name} haftalık hedeflerinin %100'ünü tamamladı`,
          status: "active",
        });
      }
    }
  }

  if (toInsert.length > 0) {
    await supabase.from("notifications").insert(toInsert);
  }
}

export default async function CoachNotificationsPage() {
  const view = await getViewContext("coach");

  if (!view) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-muted-foreground text-sm">Oturum bulunamadı.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const coachId = view.effectiveUserId;

  const [{ data: rosterLinks }, { data: settingsRow }] = await Promise.all([
    supabase.from("coach_students").select("student_id").eq("coach_id", coachId),
    supabase
      .from("coach_settings")
      .select("inactivity_threshold_days, critical_completion_threshold_pct, success_alert_enabled")
      .eq("coach_id", coachId)
      .maybeSingle(),
  ]);

  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  const { data: profiles } =
    studentIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", studentIds) : { data: [] };
  const roster = (profiles ?? []) as RosterStudent[];
  const settings = settingsRow ?? DEFAULT_SETTINGS;

  // Generating notifications is a write -- never runs while impersonating,
  // so simply viewing this page as a target coach can't mutate their data.
  if (!view.isImpersonating) {
    await syncThresholdNotifications(supabase, coachId, roster, settings);
  }

  const { data: notificationRows } = await supabase
    .from("notifications")
    .select("*")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rosterById = new Map(roster.map((s) => [s.id, s]));
  const notifications: CoachNotification[] = (notificationRows ?? []).map((n) => ({
    ...n,
    studentName: n.student_id ? (rosterById.get(n.student_id)?.full_name ?? null) : null,
  }));

  // Completed notifications auto-hide from the UI 24h after being marked
  // done -- the row itself is left alone (still in "history" for anyone
  // querying the table directly), only what's rendered here is filtered.
  const doneVisibleCutoff = isoTimestampDaysAgo(1);
  const active = notifications.filter((n) => n.status === "active");
  const done = notifications.filter(
    (n) => n.status === "done" && n.done_at !== null && n.done_at >= doneVisibleCutoff,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Bildirimler</h1>
        <p className="text-muted-foreground text-sm">Öğrencilerinle ilgili aktif uyarılar ve geçmiş kayıtlar.</p>
      </header>

      <NotificationsClient active={active} done={done} />
    </div>
  );
}
