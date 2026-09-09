import Link from "next/link";
import { ArrowLeft, Lock, Star } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { weekDates } from "@/lib/date";
import { COACH_REVIEWS_PAGE_SIZE } from "./constants";
import { DeactivateToggle } from "../../_components/deactivate-toggle";
import { ResetPasswordButton } from "../../_components/reset-password-button";
import { SendToPoolButton } from "../../_components/send-to-pool-button";
import { ViewAsButton } from "../../_components/view-as-button";
import { ReviewsList } from "./_components/reviews-list";

// Visual reinforcement only -- these sections were already built with no
// inputs/buttons of any kind (inspection data), this just makes that
// explicit rather than implicit for an admin skimming the page.
function ReadOnlyBadge() {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
      <Lock className="size-2.5" />
      Salt Okunur
    </span>
  );
}

const OFFLINE_THRESHOLD_MS = 48 * 60 * 60 * 1000;
const CHECK_IN_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const CHECKLIST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchCoachDetail(coachId: string) {
  const supabase = await createClient();

  const { data: coach } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("id", coachId)
    .maybeSingle();
  if (!coach) return null;

  const weekDays = weekDates(todayISO());
  const weekStart = `${weekDays[0]}T00:00:00`;
  const weekEnd = `${weekDays[6]}T23:59:59`;
  const checklistSince = new Date(Date.now() - CHECKLIST_WINDOW_MS).toISOString().slice(0, 10);

  const [
    { data: coachProfile },
    { data: roster },
    { data: weekSessions },
    { data: reviewSessions },
    { data: checkInNotes },
    { data: checklistTasks },
    { data: ratedSessions },
    { count: completedSessionCount },
  ] = await Promise.all([
    supabase.from("coach_profiles").select("max_students, last_active_at").eq("coach_id", coachId).maybeSingle(),
    supabase.from("coach_students").select("student_id").eq("coach_id", coachId),
    supabase
      .from("coaching_sessions")
      .select("id, student_id, scheduled_at, outcome")
      .eq("coach_id", coachId)
      .gte("scheduled_at", weekStart)
      .lte("scheduled_at", weekEnd)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("coaching_sessions")
      .select("id, student_id, scheduled_at, student_rating, student_feedback")
      .eq("coach_id", coachId)
      .not("student_feedback", "is", null)
      .order("scheduled_at", { ascending: false })
      .range(0, COACH_REVIEWS_PAGE_SIZE - 1),
    supabase
      .from("coach_notes")
      .select("student_id, created_at")
      .eq("coach_id", coachId)
      .eq("type", "check_in")
      .order("created_at", { ascending: false }),
    supabase
      .from("coach_tasks")
      .select("status")
      .eq("coach_id", coachId)
      .gte("task_date", checklistSince),
    // Every rated session, not just ones with written feedback (reviewSessions
    // above deliberately excludes a rating-only session) -- this is the
    // coach's true average, not just the average of sessions that also got a
    // comment.
    supabase.from("coaching_sessions").select("student_rating").eq("coach_id", coachId).not("student_rating", "is", null),
    supabase.from("coaching_sessions").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("outcome", "completed"),
  ]);

  const rosterIds = (roster ?? []).map((r) => r.student_id);

  // All-time completion rate across the current roster's coach-assigned
  // tasks -- "how much of what this coach assigned actually got done".
  const { data: rosterTasks } =
    rosterIds.length > 0
      ? await supabase.from("student_tasks").select("status").in("student_id", rosterIds).eq("is_coach_assigned", true)
      : { data: [] };
  const taskCompletionTotal = rosterTasks?.length ?? 0;
  const taskCompletionDone = (rosterTasks ?? []).filter((t) => t.status === "done").length;
  const taskCompletionPct = taskCompletionTotal > 0 ? Math.round((taskCompletionDone / taskCompletionTotal) * 100) : null;

  const ratings = (ratedSessions ?? []).map((s) => s.student_rating!).filter((r): r is number => r !== null);
  const averageRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
  // Historical sessions/reviews can reference a student who has since left
  // the roster (e.g. just sent to the pool) -- their name should still
  // resolve, so this isn't limited to current roster ids.
  const allStudentIds = new Set([
    ...rosterIds,
    ...(weekSessions ?? []).map((s) => s.student_id),
    ...(reviewSessions ?? []).map((s) => s.student_id),
  ]);
  const { data: nameProfiles } =
    allStudentIds.size > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", [...allStudentIds])
      : { data: [] };
  const nameById = new Map((nameProfiles ?? []).map((p) => [p.id, p.full_name]));

  const lastCheckInByStudent = new Map<string, string>();
  for (const note of checkInNotes ?? []) {
    if (!lastCheckInByStudent.has(note.student_id)) lastCheckInByStudent.set(note.student_id, note.created_at);
  }

  const now = Date.now();
  const rosterWithCheckIn = rosterIds.map((id) => {
    const lastCheckIn = lastCheckInByStudent.get(id) ?? null;
    const isStale = !lastCheckIn || now - new Date(lastCheckIn).getTime() > CHECK_IN_STALE_MS;
    return { id, full_name: nameById.get(id) ?? null, lastCheckIn, isStale };
  });

  const checklistDone = (checklistTasks ?? []).filter((t) => t.status === "done").length;
  const checklistNotDone = (checklistTasks ?? []).filter((t) => t.status === "not_done").length;
  const checklistTotal = checklistDone + checklistNotDone;
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : null;

  const lastActiveAt = coachProfile?.last_active_at ?? null;
  const isOffline = !lastActiveAt || now - new Date(lastActiveAt).getTime() > OFFLINE_THRESHOLD_MS;
  const daysSinceActive = lastActiveAt ? Math.floor((now - new Date(lastActiveAt).getTime()) / (24 * 60 * 60 * 1000)) : null;

  const reviews = (reviewSessions ?? []).map((s) => ({
    id: s.id,
    studentName: nameById.get(s.student_id) ?? "İsimsiz Öğrenci",
    scheduledAt: s.scheduled_at,
    rating: s.student_rating,
    feedback: s.student_feedback,
  }));

  return {
    coach,
    maxStudents: coachProfile?.max_students ?? 20,
    lastActiveAt,
    isOffline,
    daysSinceActive,
    weekSessions: (weekSessions ?? []).map((s) => ({ ...s, studentName: nameById.get(s.student_id) ?? "İsimsiz Öğrenci" })),
    reviews,
    reviewsHasMore: reviews.length === COACH_REVIEWS_PAGE_SIZE,
    roster: rosterWithCheckIn,
    checklistPct,
    delayedCheckInCount: rosterWithCheckIn.filter((r) => r.isStale).length,
    averageRating,
    ratingCount: ratings.length,
    taskCompletionPct,
    completedSessionCount: completedSessionCount ?? 0,
  };
}

export default async function CoachDetailPage(props: PageProps<"/admin/coaches/[id]">) {
  const { id } = await props.params;
  const detail = await fetchCoachDetail(id);

  if (!detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-muted-foreground text-sm">Koç bulunamadı.</p>
      </div>
    );
  }

  const {
    coach,
    maxStudents,
    isOffline,
    daysSinceActive,
    weekSessions,
    reviews,
    reviewsHasMore,
    roster,
    checklistPct,
    delayedCheckInCount,
    averageRating,
    ratingCount,
    taskCompletionPct,
    completedSessionCount,
  } = detail;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/coaches" className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Koçlar
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-foreground">{coach.full_name ?? "(İsimsiz)"}</h1>
          {!coach.is_active && (
            <span className="bg-rose-500/15 text-rose-700 rounded-full px-2.5 py-1 text-xs font-medium">Pasif</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isOffline ? "bg-rose-500/15 text-rose-700" : "bg-emerald-500/15 text-emerald-700"}`}>
            {isOffline
              ? daysSinceActive !== null
                ? `${daysSinceActive} Gündür Giriş Yapmadı`
                : "Hiç Giriş Yapmadı"
              : "Çevrimiçi"}
          </span>
          <ViewAsButton targetId={coach.id} targetRole="coach" targetName={coach.full_name ?? "İsimsiz Koç"} />
        </div>
      </header>

      <div className="space-y-6">
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Performans Metrikleri</h2>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">Kapasite</p>
              <p className="text-foreground font-medium">{roster.length} / {maxStudents}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Checklist Tamamlama (14 gün)</p>
              <p className="text-foreground font-medium">{checklistPct !== null ? `%${checklistPct}` : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Gecikmiş Bilgilendirme</p>
              <p className={`font-medium ${delayedCheckInCount > 0 ? "text-rose-600" : "text-foreground"}`}>
                {delayedCheckInCount} öğrenci
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Ortalama Öğrenci Puanı</p>
              <p className="text-foreground flex items-center gap-1 font-medium">
                {averageRating !== null ? (
                  <>
                    <Star className="size-3.5 fill-current text-amber-500" />
                    {averageRating.toFixed(1)} / 5
                    <span className="text-muted-foreground text-xs font-normal">({ratingCount})</span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Öğrenci Görev Tamamlama Oranı</p>
              <p className="text-foreground font-medium">{taskCompletionPct !== null ? `%${taskCompletionPct}` : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tamamlanan Görüşme Sayısı</p>
              <p className="text-foreground font-medium">{completedSessionCount}</p>
            </div>
          </div>
        </section>

        <section className="border-border rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold">Haftalık Program</h2>
            <ReadOnlyBadge />
          </div>
          {weekSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Bu hafta planlanmış görüşme yok.</p>
          ) : (
            <div className="space-y-1.5">
              {weekSessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{s.studentName}</span>
                  <span className="text-muted-foreground">{formatDateTime(s.scheduled_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-border rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold">Öğrenci Yorumları</h2>
            <ReadOnlyBadge />
          </div>
          <ReviewsList coachId={coach.id} initialReviews={reviews} initialHasMore={reviewsHasMore} />
        </section>

        <section className="border-border rounded-lg border p-4">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Öğrenci Listesi</h2>
          {roster.length === 0 ? (
            <p className="text-muted-foreground text-sm">Bu koça atanmış öğrenci yok.</p>
          ) : (
            <div className="space-y-2">
              {roster.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="text-foreground">{s.full_name ?? "(İsimsiz)"}</span>
                    {s.isStale && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {s.lastCheckIn ? `Son bilgilendirme: ${formatDateTime(s.lastCheckIn)}` : "Hiç bilgilendirme yok"}
                      </span>
                    )}
                  </div>
                  <SendToPoolButton studentId={s.id} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-border rounded-lg border p-4">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Hesap Yönetimi</h2>
          <div className="flex flex-wrap items-start gap-4">
            <ResetPasswordButton userId={coach.id} />
            <DeactivateToggle userId={coach.id} isActive={coach.is_active} />
          </div>
        </section>
      </div>
    </div>
  );
}
