// Yoklama (event attendance) with sessions: the pure logic shared by the coach's roll call and the parent's report card.
//
// An event has `sessionCount` sessions (1..SESSION_COUNT_MAX). For each student the coach marks each session Geldi ("attended") or
// Gelmedi ("not_attended"); an unmarked session simply has no record. The student's own RSVP ("attending" / "not_attending" / none) is
// a different fact (announcement_rsvps) and is only compared with the attendance here, never merged into it.

export const SESSION_COUNT_MAX = 20;

export type AttendanceStatus = "attended" | "not_attended";
export type RsvpResponse = "attending" | "not_attending";

// A whole number 1..SESSION_COUNT_MAX, or null for anything else (empty, 0, 2.5, 21, "abc").
export function parseSessionCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= SESSION_COUNT_MAX ? n : null;
}

export type SessionMark = { sessionNumber: number; status: AttendanceStatus | null };

export type StudentEventSummary = {
  sessions: SessionMark[];
  attended: number;
  absent: number;
  unmarked: number;
  // RSVP'd "attending" but was marked absent for EVERY session the coach recorded (and attended none): the report card's red flag.
  noShow: boolean;
  // RSVP'd "attending", attended at least one session but was marked absent for another: a milder note.
  partialAbsence: boolean;
};

export function summarizeStudentEvent(
  sessionCount: number,
  marks: ReadonlyMap<number, AttendanceStatus> | Record<number, AttendanceStatus>,
  rsvp: RsvpResponse | null,
): StudentEventSummary {
  const get = (n: number): AttendanceStatus | undefined => (marks instanceof Map ? marks.get(n) : (marks as Record<number, AttendanceStatus>)[n]);
  const sessions: SessionMark[] = Array.from({ length: sessionCount }, (_, i) => ({ sessionNumber: i + 1, status: get(i + 1) ?? null }));
  const attended = sessions.filter((s) => s.status === "attended").length;
  const absent = sessions.filter((s) => s.status === "not_attended").length;
  return {
    sessions,
    attended,
    absent,
    unmarked: sessionCount - attended - absent,
    noShow: rsvp === "attending" && absent > 0 && attended === 0,
    partialAbsence: rsvp === "attending" && absent > 0 && attended > 0,
  };
}

export function sessionStatusLabel(status: AttendanceStatus | null): string {
  return status === "attended" ? "Katıldı" : status === "not_attended" ? "Katılmadı" : "Yoklama alınmadı";
}

export function rsvpLabel(rsvp: RsvpResponse | null): string {
  return rsvp === "attending" ? "Katılacağım" : rsvp === "not_attending" ? "Katılmayacağım" : "Yanıt vermedi";
}

// ---- the parent's report card ------------------------------------------------------------------------------------------------

export type ParentEventAttendance = {
  announcementId: string;
  title: string;
  // YYYY-MM-DD the event is placed on (its event_date; the first day attendance was marked for a date-less event).
  date: string;
  rsvp: RsvpResponse | null;
  declineReason: string | null;
  sessionCount: number;
  summary: StudentEventSummary;
};

type AnnouncementRow = { id: string; title: string; event_date: string | null };
type ConfigRow = { announcement_id: string; session_count: number };
type AttendanceRow = { announcement_id: string; session_number: number; status: AttendanceStatus; marked_at: string };
type RsvpRow = { announcement_id: string; response: RsvpResponse; decline_reason: string | null };

// The events of ONE student that fall inside a report-card period [rangeStart, rangeEnd] and for which the coach recorded at least one
// mark, oldest first. An event the coach never marked this student for is left out (there is nothing to report).
export function buildParentEventAttendance(input: {
  announcements: AnnouncementRow[];
  configs: ConfigRow[];
  attendance: AttendanceRow[];
  rsvps: RsvpRow[];
  rangeStart: string;
  rangeEnd: string;
}): ParentEventAttendance[] {
  const configById = new Map(input.configs.map((c) => [c.announcement_id, c.session_count]));
  const rsvpById = new Map(input.rsvps.map((r) => [r.announcement_id, r]));
  const marksById = new Map<string, AttendanceRow[]>();
  for (const row of input.attendance) {
    const list = marksById.get(row.announcement_id) ?? [];
    list.push(row);
    marksById.set(row.announcement_id, list);
  }

  const result: ParentEventAttendance[] = [];
  for (const a of input.announcements) {
    const rows = marksById.get(a.id);
    if (!rows || rows.length === 0) continue;
    const date = a.event_date ?? rows.map((r) => r.marked_at.slice(0, 10)).sort()[0];
    if (date < input.rangeStart || date > input.rangeEnd) continue;

    // Marks beyond the configured count (the count was lowered later) are ignored; with no config at all, the highest marked session counts.
    const configured = configById.get(a.id);
    const sessionCount = configured ?? Math.max(...rows.map((r) => r.session_number));
    const marks = new Map<number, AttendanceStatus>();
    for (const r of rows) if (r.session_number >= 1 && r.session_number <= sessionCount) marks.set(r.session_number, r.status);
    if (marks.size === 0) continue;

    const rsvp = rsvpById.get(a.id);
    result.push({
      announcementId: a.id,
      title: a.title,
      date,
      rsvp: rsvp?.response ?? null,
      declineReason: rsvp?.decline_reason ?? null,
      sessionCount,
      summary: summarizeStudentEvent(sessionCount, marks, rsvp?.response ?? null),
    });
  }
  return result.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.title.localeCompare(y.title, "tr")));
}
