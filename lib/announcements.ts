import { createClient } from "@/lib/supabase/server";

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type AnnouncementRsvpResponse = "attending" | "not_attending";

export type StudentAnnouncement = {
  id: string;
  title: string;
  content: string;
  event_date: string | null;
  event_time: string | null;
  requires_rsvp: boolean;
  myResponse: AnnouncementRsvpResponse | null;
};

export type ParentAnnouncement = {
  id: string;
  title: string;
  content: string;
  event_date: string | null;
  event_time: string | null;
  requires_rsvp: boolean;
  studentResponse: AnnouncementRsvpResponse | null;
  studentDeclineReason: string | null;
};

export type CoachAnnouncement = {
  id: string;
  title: string;
  content: string;
  event_date: string | null;
  event_time: string | null;
  requires_rsvp: boolean;
};

// Announcements only start appearing 7 days before their event_date (a
// null event_date is a plain, non-timed announcement and shows right
// away). Shared by the student layout, parent layout, and parent page --
// previously three near-identical copies of this same query.
async function fetchActiveAnnouncementRows() {
  const supabase = await createClient();
  const today = todayISO();
  const sevenDaysOut = addDaysISO(today, 7);
  const { data } = await supabase
    .from("announcements")
    .select("id, title, content, event_date, event_time, requires_rsvp")
    .eq("is_active", true)
    .or(`expiry_date.is.null,expiry_date.gte.${today}`)
    .or(`event_date.is.null,event_date.lte.${sevenDaysOut}`)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function fetchStudentAnnouncements(studentId: string): Promise<StudentAnnouncement[]> {
  const supabase = await createClient();
  const rows = await fetchActiveAnnouncementRows();
  const ids = rows.map((a) => a.id);

  const { data: rsvps } =
    ids.length > 0
      ? await supabase.from("announcement_rsvps").select("announcement_id, response").eq("student_id", studentId).in("announcement_id", ids)
      : { data: [] };

  const rsvpByAnnouncement = new Map((rsvps ?? []).map((r) => [r.announcement_id, r.response]));
  return rows.map((a) => ({ ...a, myResponse: rsvpByAnnouncement.get(a.id) ?? null }));
}

// Read-only for parents -- no RSVP action of their own, just a view of
// their (active) linked student's response. announcement_rsvps'
// announcement_rsvps_parent_read policy (migration 0053) scopes this to
// students actually linked to the calling parent, so passing a wrong/
// unlinked studentId here would just come back empty, not leak data.
export async function fetchParentAnnouncements(studentId: string | null): Promise<ParentAnnouncement[]> {
  const supabase = await createClient();
  const rows = await fetchActiveAnnouncementRows();
  const ids = rows.map((a) => a.id);

  const { data: rsvps } =
    studentId && ids.length > 0
      ? await supabase
          .from("announcement_rsvps")
          .select("announcement_id, response, decline_reason")
          .eq("student_id", studentId)
          .in("announcement_id", ids)
      : { data: [] };

  const rsvpByAnnouncement = new Map((rsvps ?? []).map((r) => [r.announcement_id, r]));
  return rows.map((a) => {
    const rsvp = rsvpByAnnouncement.get(a.id);
    return { ...a, studentResponse: rsvp?.response ?? null, studentDeclineReason: rsvp?.decline_reason ?? null };
  });
}

// Read-only for coaches -- unlike a parent, a coach has many students, not
// one linked student, so there's no single RSVP "response" of their own to
// join in (per-student participation detail lives on the coach's own
// dedicated /coach/events page instead). Just the plain active announcement
// list, same one every panel already sees.
export async function fetchCoachAnnouncements(): Promise<CoachAnnouncement[]> {
  return fetchActiveAnnouncementRows();
}

// The subset of active announcements that are actually RSVP-gated -- reuses
// the exact same active/in-window query as every other panel
// (fetchActiveAnnouncementRows) so this can never drift out of sync with
// what a student is actually shown. Used by the coach's /coach/events page
// to build one Katılacaklar/Katılmayacaklar/Cevap Bekleyenler section per
// announcement, plus its event date/time for display.
export async function fetchActiveRsvpRequiredAnnouncements(): Promise<CoachAnnouncement[]> {
  const rows = await fetchActiveAnnouncementRows();
  return rows.filter((a) => a.requires_rsvp);
}

export type EventListing = CoachAnnouncement & {
  is_active: boolean;
  expiry_date: string | null;
  // False once the announcement has left the "active, inside its display window" set the other panels show.
  isCurrent: boolean;
};

// Every RSVP-gated event, past and expired ones included, newest first (an event with no date last). The coach's /coach/events page
// uses it so attendance can be entered or corrected retroactively: the plain "active" query above hides an announcement after its
// expiry date, and the roll call must stay reachable after that. `isCurrent` marks the ones that are still in the active window.
// Capped at the most recent EVENT_LISTING_LIMIT events to keep the page bounded.
export const EVENT_LISTING_LIMIT = 80;

export async function fetchAllRsvpRequiredEvents(): Promise<EventListing[]> {
  const supabase = await createClient();
  const today = todayISO();
  const sevenDaysOut = addDaysISO(today, 7);
  const { data } = await supabase
    .from("announcements")
    .select("id, title, content, event_date, event_time, requires_rsvp, is_active, expiry_date")
    .eq("requires_rsvp", true)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(EVENT_LISTING_LIMIT);
  return (data ?? []).map((a) => ({
    ...(a as Omit<EventListing, "isCurrent">),
    isCurrent: a.is_active === true && (a.expiry_date === null || a.expiry_date >= today) && (a.event_date === null || a.event_date <= sevenDaysOut),
  }));
}
