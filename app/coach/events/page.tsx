import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { fetchActiveRsvpRequiredAnnouncements } from "@/lib/announcements";
import { EventAttendanceSection, type EventData, type EventStudentRow } from "./_components/event-attendance-section";

type RosterStudent = { id: string; full_name: string | null };
type AttendanceStatus = "attended" | "not_attended";

async function fetchEventsData(coachId: string): Promise<EventData[]> {
  const supabase = await createClient();
  const { data: rosterLinks } = await supabase.from("coach_students").select("student_id").eq("coach_id", coachId);
  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  if (studentIds.length === 0) return [];

  // Every active, RSVP-required announcement -- one section per announcement
  // on this page, each with its own Katılacaklar/Katılmayacaklar/Cevap
  // Bekleyenler breakdown across just this coach's own roster.
  const announcements = await fetchActiveRsvpRequiredAnnouncements();
  if (announcements.length === 0) return [];
  const announcementIds = announcements.map((a) => a.id);

  const [{ data: profiles }, { data: rsvpRows }, { data: attendanceRows }, { data: configRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", studentIds),
    supabase
      .from("announcement_rsvps")
      .select("student_id, announcement_id, response, decline_reason")
      .in("student_id", studentIds)
      .in("announcement_id", announcementIds),
    supabase
      .from("announcement_attendance")
      .select("student_id, announcement_id, session_number, status")
      .in("student_id", studentIds)
      .in("announcement_id", announcementIds),
    // How many sessions each event has (set by the coach's "Yoklama Al", shared by every coach).
    supabase.from("announcement_attendance_config").select("announcement_id, session_count").in("announcement_id", announcementIds),
  ]);

  const roster = (profiles ?? []) as RosterStudent[];
  const rosterById = new Map(roster.map((s) => [s.id, s]));
  // (student, announcement) -> { session number -> status }
  const marksByPair = new Map<string, Record<number, AttendanceStatus>>();
  for (const r of attendanceRows ?? []) {
    const key = `${r.student_id}::${r.announcement_id}`;
    marksByPair.set(key, { ...(marksByPair.get(key) ?? {}), [r.session_number as number]: r.status as AttendanceStatus });
  }
  const sessionCountByAnnouncement = new Map((configRows ?? []).map((c) => [c.announcement_id as string, c.session_count as number]));

  return announcements.map((a): EventData => {
    const rowsForAnnouncement = (rsvpRows ?? []).filter((r) => r.announcement_id === a.id);
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
      sessionCount: sessionCountByAnnouncement.get(a.id) ?? null,
      attending: rowsForAnnouncement.filter((r) => r.response === "attending").map((r) => toRow(r.student_id)),
      notAttending: rowsForAnnouncement.filter((r) => r.response === "not_attending").map((r) => toRow(r.student_id)),
      pending: roster.filter((s) => !respondedIds.has(s.id)).map((s) => toRow(s.id)),
    };
  });
}

export default async function CoachEventsPage() {
  const view = await getViewContext("coach");
  const events = view ? await fetchEventsData(view.effectiveUserId) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Etkinlikler</h1>
        <p className="text-muted-foreground text-sm">
          Katılım onayı gereken duyurular, öğrenci yanıtları ve etkinlik sonrası yoklama.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="border-border bg-card rounded-xl border p-6 text-center">
          <p className="text-muted-foreground text-sm">Şu an katılım onayı bekleyen aktif bir duyuru yok.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {events.map((event) => (
            <EventAttendanceSection key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
