"use server";

// Deliberately its OWN small "use server" file, not folded into the giant
// shared app/coach/actions.ts -- a client component (attendance-dialog.tsx)
// importing just this action out of that huge shared file, while the page
// itself imports none of it, hit Next.js's known production-only "unused
// server action" dead-code-elimination bug (the action reference silently
// breaks and any call from the client crashes the whole render with an
// uncaught, error-boundary-bypassing digest -- "Minified React error #441"
// -- that never reproduces in dev). A small, single-purpose actions file per
// route sidesteps that class of bug entirely.

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { SESSION_COUNT_MAX } from "@/lib/event-attendance";

// A Server Action's thrown Error gets redacted to an opaque digest in a
// production build, so the action below never throws: it always resolves to
// one of these two plain, JSON-serializable shapes, and the dialog checks
// `.success` instead of relying on try/catch around the call.
export type SaveAttendanceResult = { success: true; sessionCount: number } | { success: false; error: string };
export type LockAttendanceResult = { success: true; lockedAt: string } | { success: false; error: string };

const LOCKED_MESSAGE = "Bu etkinliğin yoklaması kilitli; artık değiştirilemez.";
const COUNT_FROZEN_MESSAGE = "Bir koç yoklamayı kilitlediği için bu etkinliğin oturum sayısı artık değiştirilemez.";

// The database guard (migration 0135) raises "attendance_locked: ..." when a write hits a locked roll call or the frozen session count;
// that is an expected outcome, not an error to log -- anything else goes through dbError (which logs and masks it).
function failure(error: { message?: string }): { success: false; error: string } {
  if (typeof error.message === "string" && error.message.includes("attendance_locked")) return { success: false, error: LOCKED_MESSAGE };
  return { success: false, error: dbError(error as never).message };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return user;
}

const markSchema = z.object({
  studentId: uuidSchema,
  sessionNumber: z.number().int().min(1).max(SESSION_COUNT_MAX),
  // null = "not marked": the record, if any, is removed.
  status: z.enum(["attended", "not_attended"]).nullable(),
});
const saveSchema = z.object({
  announcementId: uuidSchema,
  sessionCount: z.number().int().min(1, "En az 1 oturum olmalı.").max(SESSION_COUNT_MAX, `En fazla ${SESSION_COUNT_MAX} oturum olabilir.`),
  marks: z.array(markSchema).max(5000),
});

export type AttendanceMarkInput = z.input<typeof markSchema>;

const CHUNK = 500;

// --- Coach events: Yoklama (attendance) with sessions ------------------------
//
// One call saves a whole roll call: the event's session count, then every
// Geldi / Gelmedi mark (student x session). Separate from the student's own
// RSVP (announcement_rsvps) -- see migrations 0104 and 0135. A coach can mark
// ANY student of their own roster for ANY session, whatever that student
// RSVP'd. Lowering the session count removes the records of the sessions that
// no longer exist (for this coach's students; the report card ignores any
// record beyond the count anyway).
export async function saveEventAttendance(
  announcementId: string,
  sessionCount: number,
  marks: AttendanceMarkInput[],
): Promise<SaveAttendanceResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(saveSchema, { announcementId, sessionCount, marks });
    for (const m of input.marks) {
      if (m.sessionNumber > input.sessionCount) throw new Error(`${m.sessionNumber}. oturum, oturum sayısından (${input.sessionCount}) büyük.`);
    }
    const supabase = await createClient();
    const user = await requireUser(supabase);

    // The coach's whole roster: every student in the marks must be on it (RLS would refuse the writes anyway, but the person gets a clear message).
    const { data: rosterLinks, error: rosterError } = await supabase.from("coach_students").select("student_id").eq("coach_id", user.id);
    if (rosterError) return failure(rosterError);
    const rosterIds = new Set((rosterLinks ?? []).map((l) => l.student_id as string));
    if (input.marks.some((m) => !rosterIds.has(m.studentId))) throw new Error("Bu öğrenci sana atanmamış.");

    const { data: announcement, error: announcementError } = await supabase
      .from("announcements")
      .select("id")
      .eq("id", input.announcementId)
      .maybeSingle();
    if (announcementError) return failure(announcementError);
    if (!announcement) throw new Error("Etkinlik bulunamadı.");

    // A locked roll call is final (the database refuses the writes too; this just gives the clear message first).
    const { data: lockRows, error: lockError } = await supabase.from("announcement_attendance_locks").select("coach_id").eq("announcement_id", input.announcementId);
    if (lockError) return failure(lockError);
    if ((lockRows ?? []).some((l) => l.coach_id === user.id)) return { success: false, error: LOCKED_MESSAGE };
    const someoneLocked = (lockRows ?? []).length > 0;

    // 1. The event's session count (shared by every coach). Once any coach has locked the event it is frozen: the same count is fine,
    //    a different one is refused.
    const { data: existingConfig, error: existingConfigError } = await supabase
      .from("announcement_attendance_config")
      .select("session_count")
      .eq("announcement_id", input.announcementId)
      .maybeSingle();
    if (existingConfigError) return failure(existingConfigError);
    if (existingConfig?.session_count !== input.sessionCount) {
      if (someoneLocked) return { success: false, error: COUNT_FROZEN_MESSAGE };
      const { error: configError } = await supabase.from("announcement_attendance_config").upsert(
        { announcement_id: input.announcementId, session_count: input.sessionCount, updated_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: "announcement_id" },
      );
      if (configError) return failure(configError);
    }

    // 2. Sessions that no longer exist (the count was lowered): their records go, for this coach's roster.
    if (rosterIds.size > 0) {
      const { error: trimError } = await supabase
        .from("announcement_attendance")
        .delete()
        .eq("announcement_id", input.announcementId)
        .in("student_id", [...rosterIds])
        .gt("session_number", input.sessionCount);
      if (trimError) return failure(trimError);
    }

    // The last mark for a (student, session) wins.
    const latest = new Map<string, (typeof input.marks)[number]>();
    for (const m of input.marks) latest.set(`${m.studentId}::${m.sessionNumber}`, m);
    const toSet = [...latest.values()].filter((m) => m.status !== null);
    const toClear = [...latest.values()].filter((m) => m.status === null);

    // 3. Cleared marks, one delete per session number (a handful of queries at most).
    const clearBySession = new Map<number, string[]>();
    for (const m of toClear) clearBySession.set(m.sessionNumber, [...(clearBySession.get(m.sessionNumber) ?? []), m.studentId]);
    for (const [sessionNumber, studentIds] of clearBySession) {
      const { error } = await supabase
        .from("announcement_attendance")
        .delete()
        .eq("announcement_id", input.announcementId)
        .eq("session_number", sessionNumber)
        .in("student_id", studentIds);
      if (error) return failure(error);
    }

    // 4. The marks.
    const markedAt = new Date().toISOString();
    for (let i = 0; i < toSet.length; i += CHUNK) {
      const { error } = await supabase.from("announcement_attendance").upsert(
        toSet.slice(i, i + CHUNK).map((m) => ({
          announcement_id: input.announcementId,
          student_id: m.studentId,
          session_number: m.sessionNumber,
          status: m.status,
          marked_by: user.id,
          marked_at: markedAt,
        })),
        { onConflict: "announcement_id,student_id,session_number" },
      );
      if (error) return failure(error);
    }

    // No revalidatePath: the dialog applies the saved state to the page's own
    // local state, and revalidating the very page a click originates from is
    // what once triggered a "Server Components render" crash here.
    return { success: true, sessionCount: input.sessionCount };
  } catch (e) {
    console.error("[coach events attendance]", e);
    Sentry.captureException(e);
    return { success: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}

// Kilitle: this coach's roll call for the event becomes final -- read-only for everybody from then on (the database enforces it, see
// migration 0135). The session count has to exist (a roll call was saved at least once). There is deliberately no way to undo it.
export async function lockEventAttendance(announcementId: string): Promise<LockAttendanceResult> {
  try {
    await assertNotImpersonating();
    const announcementIdV = parseInput(uuidSchema, announcementId);
    const supabase = await createClient();
    const user = await requireUser(supabase);

    const { count: rosterCount, error: rosterError } = await supabase
      .from("coach_students")
      .select("student_id", { count: "exact", head: true })
      .eq("coach_id", user.id);
    if (rosterError) return failure(rosterError);
    if (!rosterCount) throw new Error("Öğrencin olmadığı için yoklamayı kilitleyemezsin.");

    const { data: config, error: configError } = await supabase
      .from("announcement_attendance_config")
      .select("session_count")
      .eq("announcement_id", announcementIdV)
      .maybeSingle();
    if (configError) return failure(configError);
    if (!config) throw new Error("Önce oturum sayısını belirleyip yoklamayı kaydet.");

    const { error } = await supabase.from("announcement_attendance_locks").insert({ announcement_id: announcementIdV, coach_id: user.id });
    // 23505 = already locked: the outcome the person wanted, so not an error.
    if (error && error.code !== "23505") return failure(error);

    const { data: lock, error: readError } = await supabase
      .from("announcement_attendance_locks")
      .select("locked_at")
      .eq("announcement_id", announcementIdV)
      .eq("coach_id", user.id)
      .maybeSingle();
    if (readError) return failure(readError);
    return { success: true, lockedAt: (lock?.locked_at as string | undefined) ?? new Date().toISOString() };
  } catch (e) {
    console.error("[coach events attendance lock]", e);
    Sentry.captureException(e);
    return { success: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}
