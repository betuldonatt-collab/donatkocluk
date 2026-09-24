"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput, passwordSchema, uuidSchema } from "@/lib/validation";
import { COACH_REVIEWS_PAGE_SIZE } from "./coaches/[id]/constants";

// RLS can't protect an Auth-service call (resetPasswordForEmail,
// auth.admin.updateUserById) since neither one is a table write -- every
// action that touches one must do this check itself first.
//
// Security Hardening Group 4 (double-layer authorization): every action
// below now calls this before touching the database, even the ones RLS's
// is_admin() policy would already reject on its own. That's deliberate --
// this file is the highest-privilege surface in the app, so it fails
// fast with a clear, intentional rejection instead of leaning on RLS as
// the ONLY check.
async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") throw new Error("Bu işlem için yetkiniz yok.");
  return user.id;
}

// Admin-only in practice: RLS on coach_students only allows writes when
// public.is_admin() is true, so a non-admin caller gets blocked at the
// database regardless of what this action attempts.
export async function assignCoach(studentId: string, coachId: string | null) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const coachIdV = coachId === null ? null : parseInput(uuidSchema, coachId);
  const supabase = await createClient();

  if (coachIdV === null) {
    const { error } = await supabase.from("coach_students").delete().eq("student_id", studentIdV);
    if (error) throw dbError(error);
  } else {
    const { error } = await supabase
      .from("coach_students")
      .upsert({ student_id: studentIdV, coach_id: coachIdV }, { onConflict: "student_id" });
    if (error) throw dbError(error);

    // A (re)assignment starts a new quota cycle -- past sessions/notes/tasks
    // are never touched, but auto_unassign_on_quota_completion (0035) only
    // counts completed sessions from this point forward, so a renewed
    // student doesn't immediately re-trigger auto-unassign off their old
    // (now irrelevant) completed count.
    const { error: cycleError } = await supabase
      .from("profiles")
      .update({ quota_cycle_start_at: new Date().toISOString() })
      .eq("id", studentIdV);
    if (cycleError) throw dbError(cycleError);
  }

  // Coach assignments feed both this page's own table AND the main
  // dashboard's Koç Performans Uyarıları/Yenileme Radarı sections (both
  // read coach_students) -- genuinely visible on both, so both need to
  // stop serving a stale cached render.
  revalidatePath("/admin");
  revalidatePath("/admin/coach-connections");
}

const exitCategorySchema = z.string().trim().max(60).nullable();
const exitNoteSchema = z.string().trim().max(500).nullable();

// Marks a student active/inactive with an optional exit reason -- doesn't
// touch coach_students at all, so a coach's session/retention history for
// that student stays intact for the "İstatistiklerim" analytics page.
export async function setStudentStatus(
  studentId: string,
  isActive: boolean,
  exitCategory: string | null,
  exitNote: string | null,
) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const exitCategoryV = parseInput(exitCategorySchema, exitCategory);
  const exitNoteV = parseInput(exitNoteSchema, exitNote);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      is_active: isActive,
      exit_category: isActive ? null : exitCategoryV,
      exit_note: isActive ? null : exitNoteV,
      exited_at: isActive ? null : new Date().toISOString(),
    })
    .eq("id", studentIdV);
  if (error) throw dbError(error);

  // Also editable from the coach-connections table -- same reasoning as
  // assignCoach above.
  revalidatePath("/admin");
  revalidatePath("/admin/coach-connections");
}

// --- Coach note parent-sharing approval queue ---------------------------

export async function approveCoachNote(noteId: string) {
  await requireAdmin();
  const noteIdV = parseInput(uuidSchema, noteId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_notes")
    .update({ parent_share_status: "approved", admin_revision_note: null })
    .eq("id", noteIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin");
}

export async function rejectCoachNote(noteId: string) {
  await requireAdmin();
  const noteIdV = parseInput(uuidSchema, noteId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_notes")
    .update({ parent_share_status: "rejected", admin_revision_note: null })
    .eq("id", noteIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin");
}

export async function requestCoachNoteRevision(noteId: string, revisionNote: string) {
  await requireAdmin();
  const noteIdV = parseInput(uuidSchema, noteId);
  const revisionNoteV = parseInput(nonEmptyText(1000, "Revizyon notu"), revisionNote);

  const supabase = await createClient();
  const { data: note, error } = await supabase
    .from("coach_notes")
    .update({ parent_share_status: "revision_requested", admin_revision_note: revisionNoteV })
    .eq("id", noteIdV)
    .select("coach_id, student_id")
    .single();
  if (error) throw dbError(error);

  const { error: notificationError } = await supabase.from("notifications").insert({
    coach_id: note.coach_id,
    student_id: note.student_id,
    type: "note_revision_requested",
    title: "Bir notunuz için revizyon istendi",
    body: revisionNoteV,
    status: "active",
  });
  if (notificationError) throw dbError(notificationError);

  revalidatePath("/admin");
}

// --- Parent <-> student links --------------------------------------------

export async function linkParent(parentId: string, studentId: string) {
  await requireAdmin();
  const parentIdV = parseInput(uuidSchema, parentId);
  const studentIdV = parseInput(uuidSchema, studentId);
  const supabase = await createClient();
  const { error } = await supabase.from("parent_students").insert({ parent_id: parentIdV, student_id: studentIdV });
  if (error) throw dbError(error);

  revalidatePath("/admin/parent-connections");
}

export async function unlinkParent(parentId: string, studentId: string) {
  await requireAdmin();
  const parentIdV = parseInput(uuidSchema, parentId);
  const studentIdV = parseInput(uuidSchema, studentId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("parent_students")
    .delete()
    .eq("parent_id", parentIdV)
    .eq("student_id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin/parent-connections");
}

const quotaSchema = z.number().int().min(0).max(1000);

export async function updateSessionQuota(studentId: string, quota: number) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const quotaV = parseInput(quotaSchema, quota);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ total_session_quota: quotaV })
    .eq("id", studentIdV);
  if (error) throw dbError(error);

  // Also editable from the coach-connections table -- same reasoning as
  // assignCoach above.
  revalidatePath("/admin");
  revalidatePath("/admin/coach-connections");
}

// Private, admin-only CRM note on a student (e.g. "left for another
// course, do not call") -- never surfaced to the coach, parent, or
// student panels.
export async function updateAdminNotes(studentId: string, notes: string) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const notesV = parseInput(z.string().trim().max(2000), notes);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ admin_notes: notesV || null })
    .eq("id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin/students");
}

export async function updateAcademicTrack(studentId: string, track: string | null) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const trackV = parseInput(z.string().trim().max(40).nullable(), track);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ academic_track: trackV }).eq("id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin/students");
}

// 9th-grade (Maarif) flag, profiles.is_maarif9 (migration 0096). Admin-only;
// the profiles guard trigger rejects anyone else's attempt at the DB level.
export async function updateMaarif9Flag(studentId: string, value: boolean) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const valueV = parseInput(z.boolean(), value);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_maarif9: valueV }).eq("id", studentIdV).eq("role", "student");
  if (error) throw dbError(error);

  revalidatePath("/admin/students");
}

// --- Announcements ---------------------------------------------------------

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçersiz saat.")
  .nullable();

const announcementSchema = z.object({
  title: nonEmptyText(200, "Başlık"),
  content: nonEmptyText(5000, "İçerik"),
  expiryDate: z.string().nullable(),
  eventDate: z.string().nullable(),
  eventTime: timeStringSchema,
  requiresRsvp: z.boolean(),
});

export async function createAnnouncement(input: {
  title: string;
  content: string;
  expiryDate: string | null;
  eventDate: string | null;
  eventTime: string | null;
  requiresRsvp: boolean;
}) {
  await requireAdmin();
  const inputV = parseInput(announcementSchema, input);
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    title: inputV.title,
    content: inputV.content,
    expiry_date: inputV.expiryDate,
    event_date: inputV.eventDate,
    // A time only means something alongside a date -- drop it if the
    // event date itself was left blank.
    event_time: inputV.eventDate ? inputV.eventTime : null,
    requires_rsvp: inputV.requiresRsvp,
  });
  if (error) throw dbError(error);

  revalidatePath("/admin");
}

export async function toggleAnnouncementActive(id: string, isActive: boolean) {
  await requireAdmin();
  const idV = parseInput(uuidSchema, id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", idV);
  if (error) throw dbError(error);

  revalidatePath("/admin");
}

export async function deleteAnnouncement(id: string) {
  await requireAdmin();
  const idV = parseInput(uuidSchema, id);
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", idV);
  if (error) throw dbError(error);

  revalidatePath("/admin");
}

// --- Student pool ------------------------------------------------------

// Assigns a coach and (optionally) links a parent in one action, so a
// pool student's card only needs a single confirm click.
export async function assignStudentFromPool(studentId: string, coachId: string, parentId: string | null) {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const coachIdV = parseInput(uuidSchema, coachId);
  const parentIdV = parentId === null ? null : parseInput(uuidSchema, parentId);
  const supabase = await createClient();

  const { error: coachError } = await supabase
    .from("coach_students")
    .upsert({ student_id: studentIdV, coach_id: coachIdV }, { onConflict: "student_id" });
  if (coachError) throw dbError(coachError);

  // Same quota-cycle reset as assignCoach -- a pool assignment IS a
  // renewal/reassignment, so it must reset the cycle too.
  const { error: cycleError } = await supabase
    .from("profiles")
    .update({ quota_cycle_start_at: new Date().toISOString() })
    .eq("id", studentIdV);
  if (cycleError) throw dbError(cycleError);

  if (parentIdV) {
    const { error: parentError } = await supabase
      .from("parent_students")
      .insert({ parent_id: parentIdV, student_id: studentIdV });
    if (parentError) throw dbError(parentError);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/students");
}

const sendToPoolReasonSchema = z.enum(["quota_completed", "absenteeism"]);

// Removes a student from their coach and tags WHY they're back in the
// pool, so the pool badge (Yenileme Bekliyor / Devamsız) is accurate --
// distinct from the plain "Atanmadı" dropdown on the main dashboard
// table, which stays untagged (quick reassignment, no pool semantics).
export async function sendToPool(studentId: string, reason: "quota_completed" | "absenteeism") {
  await requireAdmin();
  const studentIdV = parseInput(uuidSchema, studentId);
  const reasonV = parseInput(sendToPoolReasonSchema, reason);
  const supabase = await createClient();

  const { error: unassignError } = await supabase.from("coach_students").delete().eq("student_id", studentIdV);
  if (unassignError) throw dbError(unassignError);

  const { error: statusError } = await supabase.from("profiles").update({ pool_status: reasonV }).eq("id", studentIdV);
  if (statusError) throw dbError(statusError);

  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/coaches");
}

// --- Account activation (soft delete) -------------------------------------

// Deactivating instead of deleting keeps every historical record (sessions,
// notes, tasks) intact and readable -- getViewContext/requireViewContext
// (lib/impersonation.ts) block login for is_active = false at the layout
// level, and signIn() (app/login/actions.ts) blocks it immediately too.
export async function setUserActive(userId: string, isActive: boolean) {
  await requireAdmin();
  const userIdV = parseInput(uuidSchema, userId);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin/coaches");
  revalidatePath(`/admin/coaches/${userIdV}`);
}

// --- Coach capacity ------------------------------------------------------

const maxStudentsSchema = z.number().int().min(0).max(200);

export async function updateCoachCapacity(coachId: string, maxStudents: number) {
  await requireAdmin();
  const coachIdV = parseInput(uuidSchema, coachId);
  const maxStudentsV = parseInput(maxStudentsSchema, maxStudents);
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_profiles")
    .upsert({ coach_id: coachIdV, max_students: maxStudentsV }, { onConflict: "coach_id" });
  if (error) throw dbError(error);

  revalidatePath("/admin/coaches");
}

// "Daha Fazla Yükle" on the coach detail page's "Öğrenci Yorumları" list --
// the initial page.tsx load only fetches the most recent
// COACH_REVIEWS_PAGE_SIZE reviews. Resolves its own student names rather
// than relying on the page's nameById map, since a further-back review can
// reference a student outside that map's initial fetch set.
export async function getMoreCoachReviews(coachId: string, offset: number) {
  await requireAdmin();
  const coachIdV = parseInput(uuidSchema, coachId);
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("coaching_sessions")
    .select("id, student_id, scheduled_at, student_rating, student_feedback")
    .eq("coach_id", coachIdV)
    .not("student_feedback", "is", null)
    .order("scheduled_at", { ascending: false })
    .range(offset, offset + COACH_REVIEWS_PAGE_SIZE - 1);
  if (error) throw dbError(error);

  const studentIds = [...new Set((rows ?? []).map((r) => r.student_id))];
  const { data: nameProfiles } =
    studentIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", studentIds) : { data: [] };
  const nameById = new Map((nameProfiles ?? []).map((p) => [p.id, p.full_name]));

  return (rows ?? []).map((s) => ({
    id: s.id,
    studentName: nameById.get(s.student_id) ?? "İsimsiz Öğrenci",
    scheduledAt: s.scheduled_at,
    rating: s.student_rating,
    feedback: s.student_feedback,
  }));
}

// --- Two-step password lifeguard ------------------------------------------

// Directly sets another user's password. Requires the service-role
// client -- this is not a table write, so RLS cannot gate it. Every
// account here is phone-only (see approveSignupRequest) with no reliable
// email on file, so the old email-link flow never actually worked -- this
// is the one reset path that does.
export async function manualResetPassword(userId: string, newPassword: string) {
  await requireAdmin();
  const userIdV = parseInput(uuidSchema, userId);
  const newPasswordV = parseInput(passwordSchema, newPassword);

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userIdV, { password: newPasswordV });
  if (error) throw dbError(error);

  // An admin manually resetting a password IS the resolution to a
  // brute-force lockout (Security Hardening Group 1, 0041) -- clear it so
  // the user isn't still rejected at login after the admin just fixed
  // their credentials. Best-effort: the phone lookup or clear failing
  // shouldn't block the password reset that already succeeded above.
  try {
    const { data: userData } = await adminClient.auth.admin.getUserById(userIdV);
    const phone = userData.user?.phone;
    if (phone) {
      await adminClient.from("login_failed_attempts").delete().eq("phone", `+${phone}`);
    }
  } catch (e) {
    console.error("[manualResetPassword] failed to clear lockout:", e);
  }
}

// --- Pending signup requests ------------------------------------------

function generateTempPassword(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

// The ONLY place a real account is ever created from a public signup
// request. requested_role is constrained by the DB to
// student/parent/coach (0030) -- there is no value the caller could have
// submitted that results in an admin account. Uses the service-role
// client (Auth-service call, not a table write, so RLS can't gate it --
// requireAdmin() above is the actual boundary).
export async function approveSignupRequest(requestId: string): Promise<{ phone: string; tempPassword: string }> {
  await requireAdmin();
  const requestIdV = parseInput(uuidSchema, requestId);
  const supabase = await createClient();

  const { data: request, error: fetchError } = await supabase
    .from("signup_requests")
    .select("full_name, phone, requested_role, exam_type, status")
    .eq("id", requestIdV)
    .single();
  if (fetchError) throw dbError(fetchError);
  if (request.status !== "pending") throw new Error("Bu istek zaten işlenmiş.");

  // 9th-grade flag (migration 0097), read separately and tolerant of the column
  // not existing yet -- any error just means "not a 9th grader".
  const { data: maarif9Row, error: maarif9Error } = await supabase
    .from("signup_requests")
    .select("is_maarif9")
    .eq("id", requestIdV)
    .maybeSingle();
  const requestedMaarif9 = !maarif9Error && (maarif9Row as { is_maarif9?: boolean } | null)?.is_maarif9 === true;

  const tempPassword = generateTempPassword();
  const adminClient = createAdminClient();
  // role goes in app_metadata, not user_metadata -- handle_new_user() (0062)
  // only trusts raw_app_meta_data for role precisely because it's the one
  // field the public, anon-key auth.signUp() endpoint can never set itself
  // (only the service-role Admin API used right here can). full_name has
  // no privilege implications, so it stays in user_metadata as before.
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    phone: request.phone,
    password: tempPassword,
    phone_confirm: true,
    app_metadata: { role: request.requested_role },
    user_metadata: { full_name: request.full_name },
  });
  if (createError) throw dbError(createError);

  // Belt-and-suspenders, confirmed necessary in production: handle_new_user()
  // reads app_metadata.role at INSERT time, but that's occasionally observed
  // to still be empty at the exact moment its AFTER INSERT trigger fires,
  // silently falling back to its own 'student' default even though
  // app_metadata itself is correctly set on the finished auth.users row.
  // Rather than depend on that trigger's timing at all, explicitly (re)set
  // the role here as a guaranteed final step. Requires migration 0071
  // (prevent_self_role_change now exempts service-role connections,
  // matching what that trigger's own comment always claimed it did).
  const { error: roleFixError } = await adminClient
    .from("profiles")
    .update({
      role: request.requested_role,
      // exam_type defaults to 'YKS' on the profiles column itself, so this
      // only ever needs to run for an explicit 'LGS' request -- and only
      // student requests carry a value here at all (see
      // submitSignupRequest, app/login/actions.ts).
      ...(request.requested_role === "student" && request.exam_type ? { exam_type: request.exam_type } : {}),
      ...(request.requested_role === "student" && requestedMaarif9 ? { is_maarif9: true } : {}),
    })
    .eq("id", createData.user.id);
  if (roleFixError) throw dbError(roleFixError);

  const { error: updateError } = await supabase
    .from("signup_requests")
    .update({ status: "approved" })
    .eq("id", requestIdV);
  if (updateError) throw dbError(updateError);

  revalidatePath("/admin");
  return { phone: request.phone, tempPassword };
}

export async function rejectSignupRequest(requestId: string) {
  await requireAdmin();
  const requestIdV = parseInput(uuidSchema, requestId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("signup_requests")
    .update({ status: "rejected" })
    .eq("id", requestIdV);
  if (error) throw dbError(error);

  revalidatePath("/admin");
}

// --- Pending password reset requests --------------------------------------

// Just marks the queue entry handled -- the actual reset happens via
// manualResetPassword on that user's own detail page (the admin looks the
// person up by phone themselves; this table only has a phone number, not
// a user id, since the requester was never authenticated).
export async function resolvePasswordResetRequest(requestId: string) {
  const adminId = await requireAdmin();
  const requestIdV = parseInput(uuidSchema, requestId);
  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("password_reset_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: adminId })
    .eq("id", requestIdV)
    .select("phone")
    .single();
  if (error) throw dbError(error);

  // If this was an auto-generated brute-force lockout entry (0041),
  // resolving it in the queue is exactly the admin action that should
  // also unlock the account -- otherwise the user stays rejected at
  // login even after the admin has "handled" it.
  try {
    const adminClient = createAdminClient();
    await adminClient.from("login_failed_attempts").delete().eq("phone", request.phone);
  } catch (e) {
    console.error("[resolvePasswordResetRequest] failed to clear lockout:", e);
  }

  revalidatePath("/admin");
}
