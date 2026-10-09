import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { fetchAllRsvpRequiredEvents } from "@/lib/announcements";
import { fetchAllPages } from "@/lib/paged-select";
import { EventAttendanceSection, type EventData, type EventStudentRow } from "./_components/event-attendance-section";

type RosterStudent = { id: string; full_name: string | null };
type AttendanceStatus = "attended" | "not_attended";
type RsvpRow = { student_id: string; announcement_id: string; response: string; decline_reason: string | null };
type AttendanceRow = { student_id: string; announcement_id: string; session_number: number; status: string };

async function fetchEventsData(coachId: string): Promise<EventData[]> {
  const supabase = await createClient();
  const { data: rosterLinks } = await supabase.from("coach_students").select("student_id").eq("coach_id", coachId);
  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  if (studentIds.length === 0) return [];

  // Every RSVP-gated event -- the current ones AND the past / expired ones, so attendance can be entered or corrected retroactively --
  // one section each, with its own Katılacaklar/Katılmayacaklar/Cevap Bekleyenler breakdown across just this coach's own roster.
  const announcements = await fetchAllRsvpRequiredEvents();
  if (announcements.length === 0) return [];
  const announcementIds = announcements.map((a) => a.id);

  // Read in pages: roster x events easily passes the API's 1000-row cut-off now that past events are included.
  const [{ data: profiles }, rsvps, attendance, { data: configRows }, { data: lockRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", studentIds),
    fetchAllPages<RsvpRow>((from, to, withCount) =>
      supabase
        .from("announcement_rsvps")
        .select("student_id, announcement_id, response, decline_reason", withCount ? { count: "exact" } : undefined)
        .in("student_id", studentIds)
        .in("announcement_id", announcementIds)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<AttendanceRow>((from, to, withCount) =>
      supabase
        .from("announcement_attendance")
        .select("student_id, announcement_id, session_number, status", withCount ? { count: "exact" } : undefined)
        .in("student_id", studentIds)
        .in("announcement_id", announcementIds)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // How many sessions each event has (set by the coach's "Yoklama Al", shared by every coach).
    supabase.from("announcement_attendance_config").select("announcement_id, session_count").in("announcement_id", announcementIds),
    // This coach's own locks: a locked roll call is read-only.
    supabase.from("announcement_attendance_locks").select("announcement_id, locked_at").eq("coach_id", coachId).in("announcement_id", announcementIds),
  ]);

  const roster = (profiles ?? []) as RosterStudent[];
  const rosterById = new Map(roster.map((s) => [s.id, s]));
  // (student, announcement) -> { session number -> status }
  const marksByPair = new Map<string, Record<number, AttendanceStatus>>();
  for (const r of attendance.data) {
    const key = `${r.student_id}::${r.announcement_id}`;
    marksByPair.set(key, { ...(marksByPair.get(key) ?? {}), [r.session_number]: r.status as AttendanceStatus });
  }
  const sessionCountByAnnouncement = new Map((configRows ?? []).map((c) => [c.announcement_id as string, c.session_count as number]));
  const lockedAtByAnnouncement = new Map((lockRows ?? []).map((l) => [l.announcement_id as string, l.locked_at as string]));

  return announcements.map((a): EventData => {
    const rowsForAnnouncement = rsvps.data.filter((r) => r.announcement_id === a.id);
    const rsvpByStudent = new Map(rowsForAnnouncement.map((r) => [r.student_id, r]));
    const respondedIds = new Set(rowsForAnnouncement.map((r) => r.student_id));

    function toRow(studentId: string): EventStudentRow {
      return {
        studentId,
        studentName: rosterById.get(studentId)?.full_name ?? "İsimsiz Öğrenci",
        declineReason: rsvpByStudent.get(studentId)?.decline_reason ?? null,
        marks: marksByPair.get(`${studentId}::${a.id}`) ?? {},
      };
    }

    return {
      id: a.id,
      title: a.title,
      eventDate: a.event_date,
      eventTime: a.event_time,
      isCurrent: a.isCurrent,
      sessionCount: sessionCountByAnnouncement.get(a.id) ?? null,
      lockedAt: lockedAtByAnnouncement.get(a.id) ?? null,
      attending: rowsForAnnouncement.filter((r) => r.response === "attending").map((r) => toRow(r.student_id)),
      notAttending: rowsForAnnouncement.filter((r) => r.response === "not_attending").map((r) => toRow(r.student_id)),
      pending: roster.filter((s) => !respondedIds.has(s.id)).map((s) => toRow(s.id)),
    };
  });
}

export default async function CoachEventsPage() {
  const view = await getViewContext("coach");
  const events = view ? await fetchEventsData(view.effectiveUserId) : [];
  const current = events.filter((e) => e.isCurrent);
  const past = events.filter((e) => !e.isCurrent);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Etkinlikler</h1>
        <p className="text-muted-foreground text-sm">
          Katılım onayı gereken duyurular, öğrenci yanıtları ve etkinlik sonrası yoklama. Geçmiş etkinliklerin yoklamasını da girebilir
          veya düzeltebilirsin; yoklamayı kilitlediğinde artık değiştirilemez.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="border-border bg-card rounded-xl border p-6 text-center">
          <p className="text-muted-foreground text-sm">Katılım onayı gerektiren bir etkinlik yok.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {current.length === 0 ? (
            <div className="border-border bg-card rounded-xl border p-6 text-center">
              <p className="text-muted-foreground text-sm">Şu an katılım onayı bekleyen aktif bir duyuru yok.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {current.map((event) => (
                <EventAttendanceSection key={event.id} event={event} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <details className="group">
              <summary className="text-foreground hover:text-primary cursor-pointer text-lg font-semibold select-none">
                Geçmiş Etkinlikler ({past.length})
              </summary>
              <div className="mt-4 space-y-6">
                {past.map((event) => (
                  <EventAttendanceSection key={event.id} event={event} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
