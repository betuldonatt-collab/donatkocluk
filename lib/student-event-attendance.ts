import type { SupabaseClient } from "@supabase/supabase-js";

import { buildParentEventAttendance, type ParentEventAttendance } from "@/lib/event-attendance";

// The event attendance of one student for a report-card period, read as whoever is looking at the card (RLS: attendance, RSVP and the
// event's session count are readable by the student, a linked parent and the student's coach; announcements are readable by everyone
// signed in -- an event that has since expired or been deactivated still shows on the card of the period it belonged to). A failed
// read simply yields no events: the card is extra information and must never take the report card down.
export async function fetchStudentEventAttendance(
  supabase: SupabaseClient,
  studentId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<ParentEventAttendance[]> {
  const { data: attendance, error } = await supabase
    .from("announcement_attendance")
    .select("announcement_id, session_number, status, marked_at")
    .eq("student_id", studentId);
  if (error) {
    console.error("[parent karne] attendance read failed:", error);
    return [];
  }
  const ids = [...new Set((attendance ?? []).map((a) => a.announcement_id as string))];
  if (ids.length === 0) return [];

  const [announcements, configs, rsvps] = await Promise.all([
    supabase.from("announcements").select("id, title, event_date").in("id", ids),
    supabase.from("announcement_attendance_config").select("announcement_id, session_count").in("announcement_id", ids),
    supabase.from("announcement_rsvps").select("announcement_id, response, decline_reason").eq("student_id", studentId).in("announcement_id", ids),
  ]);
  if (announcements.error) {
    console.error("[parent karne] announcements read failed:", announcements.error);
    return [];
  }

  return buildParentEventAttendance({
    announcements: (announcements.data ?? []) as { id: string; title: string; event_date: string | null }[],
    configs: (configs.data ?? []) as { announcement_id: string; session_count: number }[],
    attendance: (attendance ?? []) as { announcement_id: string; session_number: number; status: "attended" | "not_attended"; marked_at: string }[],
    rsvps: (rsvps.data ?? []) as { announcement_id: string; response: "attending" | "not_attending"; decline_reason: string | null }[],
    rangeStart,
    rangeEnd,
  });
}
