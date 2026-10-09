import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { buildParentEventAttendance, parseSessionCount, rsvpLabel, sessionStatusLabel, summarizeStudentEvent } from "./event-attendance";
import { fetchStudentEventAttendance } from "./student-event-attendance";

describe("parseSessionCount", () => {
  it("accepts whole numbers 1..20 (numbers or numeric text)", () => {
    expect(parseSessionCount(1)).toBe(1);
    expect(parseSessionCount("3")).toBe(3);
    expect(parseSessionCount(" 20 ")).toBe(20);
  });
  it("rejects everything else", () => {
    for (const bad of [0, -1, 21, 2.5, "", "  ", "abc", null, undefined, NaN]) expect(parseSessionCount(bad), String(bad)).toBeNull();
  });
});

describe("summarizeStudentEvent", () => {
  it("counts attended / absent / unmarked per session", () => {
    const s = summarizeStudentEvent(3, new Map([[1, "attended"], [3, "not_attended"]] as const), "attending");
    expect(s.sessions.map((x) => [x.sessionNumber, x.status])).toEqual([[1, "attended"], [2, null], [3, "not_attended"]]);
    expect([s.attended, s.absent, s.unmarked]).toEqual([1, 1, 1]);
  });

  it("said 'Katılacağım' and was absent for every session that was marked: a no-show", () => {
    const s = summarizeStudentEvent(2, { 1: "not_attended", 2: "not_attended" }, "attending");
    expect(s.noShow).toBe(true);
    expect(s.partialAbsence).toBe(false);
  });

  it("a single marked absence with the other sessions not marked yet is still a no-show (nothing attended)", () => {
    expect(summarizeStudentEvent(3, { 2: "not_attended" }, "attending").noShow).toBe(true);
  });

  it("said 'Katılacağım', came to some sessions and missed others: only the milder partial-absence flag", () => {
    const s = summarizeStudentEvent(2, { 1: "attended", 2: "not_attended" }, "attending");
    expect(s.noShow).toBe(false);
    expect(s.partialAbsence).toBe(true);
  });

  it("no flag when they attended everything, when nothing was marked, or when they never said they would come", () => {
    expect(summarizeStudentEvent(2, { 1: "attended", 2: "attended" }, "attending")).toMatchObject({ noShow: false, partialAbsence: false });
    expect(summarizeStudentEvent(2, {}, "attending")).toMatchObject({ noShow: false, partialAbsence: false });
    expect(summarizeStudentEvent(1, { 1: "not_attended" }, "not_attending")).toMatchObject({ noShow: false, partialAbsence: false });
    expect(summarizeStudentEvent(1, { 1: "not_attended" }, null)).toMatchObject({ noShow: false, partialAbsence: false });
  });

  it("labels", () => {
    expect(sessionStatusLabel("attended")).toBe("Katıldı");
    expect(sessionStatusLabel("not_attended")).toBe("Katılmadı");
    expect(sessionStatusLabel(null)).toBe("Yoklama alınmadı");
    expect(rsvpLabel("attending")).toBe("Katılacağım");
    expect(rsvpLabel("not_attending")).toBe("Katılmayacağım");
    expect(rsvpLabel(null)).toBe("Yanıt vermedi");
  });
});

describe("buildParentEventAttendance", () => {
  const announcements = [
    { id: "a1", title: "Seminer", event_date: "2026-10-05" },
    { id: "a2", title: "Deneme Günü", event_date: "2026-09-10" },
    { id: "a3", title: "Tarihsiz Etkinlik", event_date: null },
    { id: "a4", title: "Hiç işaretlenmedi", event_date: "2026-10-06" },
  ];
  const mark = (announcement_id: string, session_number: number, status: "attended" | "not_attended", marked_at = "2026-10-05T10:00:00Z") => ({
    announcement_id,
    session_number,
    status,
    marked_at,
  });
  const base = {
    announcements,
    configs: [
      { announcement_id: "a1", session_count: 2 },
      { announcement_id: "a2", session_count: 1 },
    ],
    rsvps: [{ announcement_id: "a1", response: "attending" as const, decline_reason: null }],
    rangeStart: "2026-10-01",
    rangeEnd: "2026-10-31",
  };

  it("one event, session by session, with the RSVP and the no-show flag", () => {
    const events = buildParentEventAttendance({ ...base, attendance: [mark("a1", 1, "not_attended"), mark("a1", 2, "not_attended")] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ announcementId: "a1", title: "Seminer", date: "2026-10-05", rsvp: "attending", sessionCount: 2 });
    expect(events[0].summary.sessions.map((s) => s.status)).toEqual(["not_attended", "not_attended"]);
    expect(events[0].summary.noShow).toBe(true);
  });

  it("only the events of the period (by event date) are listed; an event with no marks for this student is left out", () => {
    const events = buildParentEventAttendance({
      ...base,
      attendance: [mark("a1", 1, "attended"), mark("a2", 1, "attended")],
    });
    expect(events.map((e) => e.announcementId)).toEqual(["a1"]);
  });

  it("a date-less event is placed on the day attendance was first marked", () => {
    const events = buildParentEventAttendance({ ...base, attendance: [mark("a3", 1, "attended", "2026-10-12T08:00:00Z")] });
    expect(events.map((e) => [e.announcementId, e.date])).toEqual([["a3", "2026-10-12"]]);
    // ...and with no configured count, the highest marked session counts
    expect(events[0].sessionCount).toBe(1);
  });

  it("marks beyond the (lowered) session count are ignored; an event whose marks are all beyond it disappears", () => {
    const events = buildParentEventAttendance({
      ...base,
      configs: [{ announcement_id: "a1", session_count: 1 }],
      attendance: [mark("a1", 1, "attended"), mark("a1", 2, "not_attended")],
    });
    expect(events[0].sessionCount).toBe(1);
    expect(events[0].summary.sessions.map((s) => s.status)).toEqual(["attended"]);
    const none = buildParentEventAttendance({ ...base, configs: [{ announcement_id: "a1", session_count: 1 }], attendance: [mark("a1", 2, "attended")] });
    expect(none).toEqual([]);
  });

  it("is listed oldest first", () => {
    const events = buildParentEventAttendance({
      ...base,
      announcements: [
        { id: "a1", title: "B", event_date: "2026-10-20" },
        { id: "a5", title: "A", event_date: "2026-10-02" },
      ],
      configs: [],
      attendance: [mark("a1", 1, "attended"), mark("a5", 1, "attended")],
    });
    expect(events.map((e) => e.title)).toEqual(["A", "B"]);
  });
});

describe("fetchStudentEventAttendance", () => {
  function fakeClient(tables: Record<string, { data: unknown[] | null; error?: unknown }>) {
    return {
      from(table: string) {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in"]) b[m] = () => b;
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table]?.data ?? [], error: tables[table]?.error ?? null });
        return b;
      },
    };
  }

  it("reads the student's attendance, the events, their session counts and the RSVP, and builds the period's events", async () => {
    const client = fakeClient({
      announcement_attendance: { data: [{ announcement_id: "a1", session_number: 1, status: "not_attended", marked_at: "2026-10-05T10:00:00Z" }] },
      announcements: { data: [{ id: "a1", title: "Seminer", event_date: "2026-10-05" }] },
      announcement_attendance_config: { data: [{ announcement_id: "a1", session_count: 1 }] },
      announcement_rsvps: { data: [{ announcement_id: "a1", response: "attending", decline_reason: null }] },
    });
    const events = await fetchStudentEventAttendance(client as never, "s1", "2026-10-01", "2026-10-31");
    expect(events).toHaveLength(1);
    expect(events[0].summary.noShow).toBe(true);
  });

  it("a failed read gives no events instead of breaking the report card", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient({ announcement_attendance: { data: null, error: { message: "column session_number does not exist" } } });
    expect(await fetchStudentEventAttendance(client as never, "s1", "2026-10-01", "2026-10-31")).toEqual([]);
  });
});

describe("migration 0135", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0135_attendance_sessions.sql", import.meta.url), "utf8");

  it("existing single-status rows become session 1, the unique key gains the session, and the event's session count has its own table", () => {
    expect(sql).toContain("add column if not exists session_number int not null default 1");
    expect(sql).toContain("create unique index if not exists announcement_attendance_session_unique");
    expect(sql).toContain("(announcement_id, student_id, session_number)");
    expect(sql).toContain("create table if not exists public.announcement_attendance_config");
    expect(sql).toContain("session_count >= 1 and session_count <= 20");
    // already-recorded events were single-session events
    expect(sql).toMatch(/insert into public\.announcement_attendance_config[\s\S]*select distinct a\.announcement_id, 1/);
  });

  it("the count is readable by everyone signed in (the parent's report card needs it) but writable only by a coach with students or an admin", () => {
    expect(sql).toMatch(/attendance_config_read[\s\S]*for select to authenticated\s+using \(true\)/);
    expect(sql).toContain("attendance_config_coach_write");
    expect(sql).toContain("attendance_config_admin_all");
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });
});

describe("migration 0135: locking", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0135_attendance_sessions.sql", import.meta.url), "utf8");

  it("one lock per (event, coach), created by the coach themself, with NO update/delete policy for coaches (no unlock from the app)", () => {
    expect(sql).toContain("create table if not exists public.announcement_attendance_locks");
    expect(sql).toContain("primary key (announcement_id, coach_id)");
    expect(sql).toMatch(/attendance_locks_coach_insert[\s\S]*for insert to authenticated[\s\S]*coach_id = \(select auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/attendance_locks_coach_(update|delete|all)/);
  });

  it("a trigger freezes the attendance rows of a locked coach's students for everyone, but lets cascades (deleting the event or the student) through", () => {
    expect(sql).toContain("create trigger announcement_attendance_guard_locked");
    expect(sql).toMatch(/before insert or update or delete on public\.announcement_attendance/);
    expect(sql).toContain("pg_trigger_depth() > 1");
    expect(sql).toMatch(/guard_locked_attendance\(\)[\s\S]*security definer/);
    expect(sql).toContain("raise exception 'attendance_locked:");
  });

  it("once anyone has locked an event its session count is frozen", () => {
    expect(sql).toContain("create trigger announcement_attendance_config_guard_locked");
    expect(sql).toContain("new.session_count is distinct from old.session_count");
  });
});
