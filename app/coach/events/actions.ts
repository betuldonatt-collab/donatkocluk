"use server";

// Deliberately its OWN small "use server" file, not folded into the giant
// shared app/coach/actions.ts -- a client component (event-attendance-
// section.tsx) importing just these two actions out of that huge shared
// file, while the page itself imports none of it, hit Next.js's known
// production-only "unused server action" dead-code-elimination bug (the
// action reference silently breaks and any call from the client crashes
// the whole render with an uncaught, error-boundary-bypassing digest --
// "Minified React error #441" -- that never reproduces in dev). A small,
// single-purpose actions file per route sidesteps that class of bug
// entirely, and is the fix Next.js/community guidance recommends for it.

import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { z } from "zod";

// A Server Action's thrown Error gets redacted to an opaque digest in a
// production build (and, per the last round of debugging this feature, a
// thrown error occasionally never reaches the client's try/catch at all --
// it surfaces as an uncaught, error-boundary-bypassing crash instead). Every
// action below therefore never throws: it always resolves to one of these
// two plain, JSON-serializable shapes, and event-attendance-section.tsx
// checks `.success` instead of relying on try/catch around the call.
export type AttendanceActionResult = { success: true } | { success: false; error: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return user;
}

async function requireCoachAccess(supabase: SupabaseClient, coachId: string, studentId: string) {
  const { data: link } = await supabase
    .from("coach_students")
    .select("student_id")
    .eq("coach_id", coachId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!link) throw new Error("Bu öğrenci sana atanmamış.");
}

const attendanceStatusSchema = z.enum(["attended", "not_attended"]);

// --- Coach events: post-event attendance (Yoklama) -------------------------
//
// Separate from the student's own RSVP response (announcement_rsvps) -- see
// migration 0104's header comment. A coach can mark ANY roster student for
// ANY active announcement, regardless of what (if anything) that student
// RSVP'd, since someone who declined can still show up and someone who never
// answered still might.

export async function upsertAnnouncementAttendance(
  announcementId: string,
  studentId: string,
  status: "attended" | "not_attended",
): Promise<AttendanceActionResult> {
  try {
    await assertNotImpersonating();
    const announcementIdV = parseInput(uuidSchema, announcementId);
    const studentIdV = parseInput(uuidSchema, studentId);
    const statusV = parseInput(attendanceStatusSchema, status);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    await requireCoachAccess(supabase, user.id, studentIdV);

    const { error } = await supabase.from("announcement_attendance").upsert(
      {
        announcement_id: announcementIdV,
        student_id: studentIdV,
        status: statusV,
        marked_by: user.id,
        marked_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,student_id" },
    );
    // dbError still logs the real error (console + Sentry) -- only its
    // already-generic .message crosses back to the client, never the raw
    // Supabase/Postgres error object itself.
    if (error) return { success: false, error: dbError(error).message };
    // No revalidatePath: the client already applies the new status
    // optimistically (event-attendance-section.tsx), and revalidating the
    // very page a click originates from is what triggered the earlier
    // "Server Components render" crash -- there's nothing here that needs a
    // forced mid-transition refetch of this same route.
    return { success: true };
  } catch (e) {
    console.error("[coach events attendance]", e);
    Sentry.captureException(e);
    return { success: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}

// Clicking the already-active Katıldı/Katılmadı button again clears it back
// to "not yet marked" (a toggle, not a one-way switch) -- deleting the row
// is simpler and cheaper than adding a third nullable enum state to update to.
export async function clearAnnouncementAttendance(announcementId: string, studentId: string): Promise<AttendanceActionResult> {
  try {
    await assertNotImpersonating();
    const announcementIdV = parseInput(uuidSchema, announcementId);
    const studentIdV = parseInput(uuidSchema, studentId);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    await requireCoachAccess(supabase, user.id, studentIdV);

    const { error } = await supabase
      .from("announcement_attendance")
      .delete()
      .eq("announcement_id", announcementIdV)
      .eq("student_id", studentIdV);
    if (error) return { success: false, error: dbError(error).message };
    return { success: true };
  } catch (e) {
    console.error("[coach events attendance]", e);
    Sentry.captureException(e);
    return { success: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}
