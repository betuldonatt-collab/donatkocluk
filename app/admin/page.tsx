import { createClient } from "@/lib/supabase/server";
import { AnnouncementsAdmin } from "./announcements-admin";
import { CoachAlerts } from "./_components/coach-alerts";
import { RenewalRadar } from "./_components/renewal-radar";
import { CoachAssignmentTable } from "./coach-assignment-table";
import { PendingNotesQueue } from "./pending-notes-queue";
import { PendingPasswordResets } from "./pending-password-resets";
import { PendingSignupRequests } from "./pending-signup-requests";

const OFFLINE_MS = 48 * 60 * 60 * 1000;
const CHECK_IN_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function checklistWindowStart() {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function computeCoachAlerts(
  coaches: { id: string; full_name: string | null }[],
  coachProfiles: { coach_id: string; last_active_at: string | null }[],
  checklistTasks: { coach_id: string; status: string }[],
  checkInNotes: { student_id: string; created_at: string }[],
  assignments: { student_id: string; coach_id: string }[],
) {
  const now = Date.now();
  const lastActiveByCoach = new Map(coachProfiles.map((cp) => [cp.coach_id, cp.last_active_at]));

  const checklistByCoach = new Map<string, { done: number; notDone: number }>();
  for (const t of checklistTasks) {
    const bucket = checklistByCoach.get(t.coach_id) ?? { done: 0, notDone: 0 };
    if (t.status === "done") bucket.done += 1;
    if (t.status === "not_done") bucket.notDone += 1;
    checklistByCoach.set(t.coach_id, bucket);
  }

  const lastCheckInByStudent = new Map<string, string>();
  for (const n of checkInNotes) {
    if (!lastCheckInByStudent.has(n.student_id)) lastCheckInByStudent.set(n.student_id, n.created_at);
  }

  const studentsByCoach = new Map<string, string[]>();
  for (const a of assignments) {
    const bucket = studentsByCoach.get(a.coach_id) ?? [];
    bucket.push(a.student_id);
    studentsByCoach.set(a.coach_id, bucket);
  }

  return coaches
    .map((c) => {
      const lastActiveAt = lastActiveByCoach.get(c.id) ?? null;
      const isOffline = !lastActiveAt || now - new Date(lastActiveAt).getTime() > OFFLINE_MS;

      const checklist = checklistByCoach.get(c.id);
      const checklistTotal = checklist ? checklist.done + checklist.notDone : 0;
      const checklistPct = checklistTotal > 0 ? Math.round((checklist!.done / checklistTotal) * 100) : null;
      const lowChecklist = checklistPct !== null && checklistPct < 50;

      const roster = studentsByCoach.get(c.id) ?? [];
      const delayedCount = roster.filter((sid) => {
        const last = lastCheckInByStudent.get(sid);
        return !last || now - new Date(last).getTime() > CHECK_IN_STALE_MS;
      }).length;

      return { id: c.id, full_name: c.full_name, isOffline, lowChecklist, checklistPct, delayedCount };
    })
    .filter((c) => c.isOffline || c.lowChecklist || c.delayedCount > 0);
}

export default async function AdminPage() {
  const supabase = await createClient();

  const [
    { data: students },
    { data: coaches },
    { data: assignments },
    { data: pendingNoteRows },
    { data: announcements },
    { data: completedSessionCounts },
    { data: coachProfiles },
    { data: checklistTasks },
    { data: checkInNotes },
    { data: signupRequests },
    { data: passwordResetRequests },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, is_active, exit_category, exit_note, total_session_quota, pool_status, exam_type")
      .eq("role", "student")
      .order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
    supabase.from("coach_students").select("student_id, coach_id"),
    supabase
      .from("coach_notes")
      .select("id, type, content, student_id, coach_id")
      .eq("parent_share_status", "pending")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("announcements")
      .select("id, title, content, expiry_date, event_date, event_time, requires_rsvp, is_active")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("student_completed_session_counts").select("student_id, completed_count"),
    supabase.from("coach_profiles").select("coach_id, last_active_at, max_students"),
    supabase.from("coach_tasks").select("coach_id, status").gte("task_date", checklistWindowStart()),
    supabase.from("coach_notes").select("coach_id, student_id, created_at").eq("type", "check_in").order("created_at", { ascending: false }),
    supabase
      .from("signup_requests")
      .select("id, full_name, phone, requested_role, exam_type")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("password_reset_requests")
      .select("id, phone, created_at, reason")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  const assignedCoachByStudent = Object.fromEntries(
    (assignments ?? []).map((a) => [a.student_id, a.coach_id]),
  );

  const peopleById = new Map(
    [...(students ?? []), ...(coaches ?? [])].map((p) => [p.id, { id: p.id, full_name: p.full_name }]),
  );
  const pendingNotes = (pendingNoteRows ?? []).map((n) => ({
    id: n.id,
    type: n.type as "main_session" | "check_in",
    content: n.content,
    student: peopleById.get(n.student_id) ?? { id: n.student_id, full_name: null },
    coach: peopleById.get(n.coach_id) ?? { id: n.coach_id, full_name: null },
  }));

  // --- Yenileme Radarı -------------------------------------------------
  // completed_count now comes pre-aggregated from student_completed_
  // session_counts (0049) -- Postgres GROUP BYs it instead of this page
  // reducing every completed session platform-wide, forever, in JS.
  const assignedStudentIds = new Set((assignments ?? []).map((a) => a.student_id));
  const completedCountByStudent = new Map(
    (completedSessionCounts ?? []).map((row) => [row.student_id, row.completed_count]),
  );
  const quotaCompletedPoolStudents = (students ?? []).filter(
    (s) => s.pool_status === "quota_completed" && !assignedStudentIds.has(s.id),
  );
  const nearingCompletionStudents = (students ?? [])
    .filter((s) => assignedStudentIds.has(s.id) && (completedCountByStudent.get(s.id) ?? 0) >= 4)
    .map((s) => ({ id: s.id, full_name: s.full_name, completedCount: completedCountByStudent.get(s.id) ?? 0 }));

  // --- Coach capacity (Group 3b: "Ahmet Yılmaz - Aktif: 12 Öğrenci") -----
  const activeCountByCoach = new Map<string, number>();
  for (const a of assignments ?? []) {
    activeCountByCoach.set(a.coach_id, (activeCountByCoach.get(a.coach_id) ?? 0) + 1);
  }
  const maxStudentsByCoach = new Map((coachProfiles ?? []).map((cp) => [cp.coach_id, cp.max_students]));
  const coachesWithCapacity = (coaches ?? []).map((c) => ({
    ...c,
    activeCount: activeCountByCoach.get(c.id) ?? 0,
    maxStudents: maxStudentsByCoach.get(c.id) ?? 20,
  }));

  // --- Coach crisis panel ------------------------------------------------
  const coachAlerts = computeCoachAlerts(
    coaches ?? [],
    coachProfiles ?? [],
    checklistTasks ?? [],
    checkInNotes ?? [],
    assignments ?? [],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Admin Paneli</h1>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-foreground">Bekleyen Kayıt İstekleri</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Yeni hesap talep eden öğrenci, veli ve koçlar -- onaylanana kadar hiçbir hesap oluşmaz.
        </p>
        <PendingSignupRequests requests={signupRequests ?? []} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Şifre Sıfırlama İstekleri</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Giriş yapamayan kullanıcılar telefon numarasıyla sıfırlama talep etti.
        </p>
        <PendingPasswordResets requests={passwordResetRequests ?? []} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Yenileme Radarı</h2>
        <p className="text-muted-foreground mb-4 text-sm">Yenileme hatırlatması gereken öğrenciler.</p>
        <RenewalRadar quotaCompleted={quotaCompletedPoolStudents} nearingCompletion={nearingCompletionStudents} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Koç Performans Uyarıları</h2>
        <p className="text-muted-foreground mb-4 text-sm">Çevrimdışı, düşük checklist tamamlama veya gecikmiş bilgilendirmesi olan koçlar.</p>
        <CoachAlerts alerts={coachAlerts} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Onay Bekleyenler</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Koçların veli paneliyle paylaşmak istediği notları incele.
        </p>
        <PendingNotesQueue notes={pendingNotes} />
      </section>

      <h2 className="text-foreground mt-12 mb-4 text-xl font-semibold">Yönetim</h2>

      <section>
        <h3 className="text-foreground text-lg font-semibold">Koç Atamaları</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Her öğrenciye bir koç ata. Bir öğrencinin tek bir koçu olabilir.
        </p>
        <CoachAssignmentTable
          students={students ?? []}
          coaches={coachesWithCapacity}
          assignedCoachByStudent={assignedCoachByStudent}
          completedCountByStudent={Object.fromEntries(completedCountByStudent)}
        />
      </section>

      <section className="mt-10">
        <h3 className="text-foreground text-lg font-semibold">Duyurular</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Öğrenci ve veli panellerine gösterilecek duyuruları yönet. Bir etkinlik tarihi girilirse duyuru,
          etkinlikten 7 gün öncesinden itibaren görünür olur.
        </p>
        <AnnouncementsAdmin announcements={announcements ?? []} />
      </section>
    </div>
  );
}
