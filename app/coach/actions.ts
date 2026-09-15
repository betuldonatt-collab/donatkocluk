"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { isValidISODateOnly } from "@/lib/chart-range";
import { countsAreConsistent } from "@/lib/count-fields";
import {
  AYT_COURSES_BY_TRACK,
  BRANCH_EXAM_MACRO_COURSES,
  findCourseById,
  findTopicById,
  isBranchExamMacroCourseId,
  TYT_COURSES,
} from "@/lib/curriculum";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput, uuidSchema } from "@/lib/validation";
import { mondayOf } from "@/lib/date";
import { STUDENT_EVENT_TYPE_LABELS, type StudentEventType } from "@/lib/student-events";
import {
  computeAylikKarne,
  computeAytScoreBreakdown,
  computeNetSummary,
  computeTotalDurationMinutes,
  computeTytScoreBreakdown,
  nextCycleRange,
  type KarneGeneralExam,
  type KarneTopicRow,
  type NetSummary,
} from "@/lib/karne";
import { STUDENT_NOTES_PAGE_SIZE } from "./students/[id]/constants";

const ALL_CURRICULUM_COURSE_IDS = [
  ...TYT_COURSES.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
  ...BRANCH_EXAM_MACRO_COURSES.map((c) => c.id),
];

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Security Hardening Group 4 (double-layer authorization): every action
// below that takes a studentId now re-verifies this coach_students link
// explicitly, in code, before touching student_tasks/coach_notes/etc. --
// not just leaning on each table's own RLS policy (student_tasks_coach_all
// and friends) as the only check. Mirrors the pre-check
// getStudentTasksForWeek/getPastWeeksForStudent already had.
async function requireCoachAccess(supabase: SupabaseClient, coachId: string, studentId: string) {
  const { data: link } = await supabase
    .from("coach_students")
    .select("student_id")
    .eq("coach_id", coachId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!link) throw new Error("Bu öğrenci sana atanmamış.");
}

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return user;
}

function buildTaskTitle(courseId: string | null | undefined, topicId: string | null | undefined): string {
  const course = findCourseById(courseId);
  if (!course) return "Görev";
  // Macro branch-exam courses ("TYT Fen") already carry their full display
  // name -- unlike every atomic course, which stores a bare name ("Fizik")
  // and relies on this prefix. Prefixing a macro course's name too would
  // double up ("TYT TYT Fen").
  const prefix = isBranchExamMacroCourseId(courseId)
    ? ""
    : courseId?.startsWith("tyt-")
      ? "TYT "
      : courseId?.startsWith("ayt-")
        ? "AYT "
        : "";
  const topic = findTopicById(courseId, topicId);
  return topic ? `${prefix}${course.name} — ${topic.name}` : `${prefix}${course.name}`;
}

// "Genel Deneme" has no course/topic at all -- per the coach's request,
// the TYT/AYT track and publisher live only in the title text (no new
// columns), e.g. "TYT Genel Deneme - 3D Yayınları".
function buildGeneralExamTitle(track: "tyt" | "ayt" | null | undefined, publisher: string | null | undefined): string {
  const prefix = track === "ayt" ? "AYT" : "TYT";
  const pub = publisher?.trim();
  return pub ? `${prefix} Genel Deneme - ${pub}` : `${prefix} Genel Deneme`;
}

// Same "no new column, publisher lives in the title text" convention as
// buildGeneralExamTitle, applied on top of the normal course+topic title --
// e.g. "TYT Türkçe — Karma (Karışık Konular) - 3D Yayınları". Branch exams
// (unlike general exams) already have a real course_id/topic_id, so only
// the publisher needs recovering from the title on edit, not the course.
function buildBranchExamTitle(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  publisher: string | null | undefined,
): string {
  const base = buildTaskTitle(courseId, topicId);
  const pub = publisher?.trim();
  return pub ? `${base} - ${pub}` : base;
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- Session evaluation (post-meeting CRM) -----------------------------

// "Görüşme Gerçekleşti": records the note, then runs both automations.
// Automation 1 always fires (one "Ara Görüşme" 3 days out). Automation 2
// fires on every 4th completed session for this student (4, 8, 12, ...).
//
// Ordering here is deliberate, not incidental: marking the session
// "completed" is the one write in this function that can fire
// auto_unassign_on_quota_completion (0027) -- an AFTER UPDATE trigger on
// coaching_sessions that deletes this coach's coach_students row the
// moment this student's completed-session count reaches their quota.
// Every other write below (coach_notes insert, coach_tasks inserts, the
// completed-count read) is RLS-gated on that same coach_students link
// still existing. Doing the coaching_sessions update FIRST (as this used
// to) meant that on exactly the qualifying session, its own trigger could
// delete the link before the very next request -- the coach_notes insert
// mirroring the note the coach just wrote -- ran, so saving a meeting
// note failed with an RLS violation immediately after the session that
// caused it. Reordering so that update runs LAST means nothing after it
// depends on the link anymore, so the race can't touch this function.
export async function evaluateSessionCompleted(sessionId: string, notes: string) {
  await assertNotImpersonating();
  const sessionIdV = parseInput(uuidSchema, sessionId);
  const notesV = parseInput(z.string().trim().max(5000), notes);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("coaching_sessions")
    .select("student_id, scheduled_at")
    .eq("id", sessionIdV)
    .single();
  if (fetchError) throw dbError(fetchError);

  // Mirrored into coach_notes (type='main_session') so this evaluation
  // shows up in the unified student-detail timeline alongside manually
  // added notes -- evaluation_notes (set below) stays too, untouched,
  // since the dashboard's read-only SessionDetailDialog still reads it
  // directly.
  const { error: noteError } = await supabase.from("coach_notes").insert({
    student_id: existing.student_id,
    coach_id: user.id,
    type: "main_session",
    content: notesV,
  });
  if (noteError) throw dbError(noteError);

  const sessionDate = existing.scheduled_at.slice(0, 10);

  const { data: followUpTask, error: followUpError } = await supabase
    .from("coach_tasks")
    .insert({
      coach_id: user.id,
      student_id: existing.student_id,
      task_date: addDaysISO(sessionDate, 3),
      title: "Ara Görüşme",
      description: "Mid-week check-in",
      source: "automation",
    })
    .select("*")
    .single();
  if (followUpError) throw dbError(followUpError);

  const newTasks = [followUpTask];

  const { count } = await supabase
    .from("coaching_sessions")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", user.id)
    .eq("student_id", existing.student_id)
    .eq("outcome", "completed");

  // +1 for the session being completed below -- counted here, before
  // that update, so this automation's read still runs while the
  // coach_students link is guaranteed intact.
  const completedCount = (count ?? 0) + 1;
  if (completedCount > 0 && completedCount % 4 === 0) {
    const { data: parentCallTask, error: parentCallError } = await supabase
      .from("coach_tasks")
      .insert({
        coach_id: user.id,
        student_id: existing.student_id,
        task_date: new Date().toISOString().slice(0, 10),
        title: "Veli Görüşmesi",
        description: `${completedCount}. tamamlanan görüşme sonrası aylık veli bilgilendirmesi`,
        source: "automation",
      })
      .select("*")
      .single();
    if (parentCallError) throw dbError(parentCallError);
    newTasks.push(parentCallTask);
  }

  const { data: session, error } = await supabase
    .from("coaching_sessions")
    .update({
      outcome: "completed",
      evaluation_notes: notesV,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/coach/dashboard");
  revalidatePath(`/coach/students/${existing.student_id}`);
  return { session, newTasks };
}

const missedReasonSchema = z.enum(["student_no_show", "coach_no_show", "other"]);

export async function evaluateSessionMissed(
  sessionId: string,
  reasonType: "student_no_show" | "coach_no_show" | "other",
  reasonNote: string | null,
) {
  await assertNotImpersonating();
  const sessionIdV = parseInput(uuidSchema, sessionId);
  const reasonTypeV = parseInput(missedReasonSchema, reasonType);
  const reasonNoteV = parseInput(z.string().trim().max(1000).nullable(), reasonNote);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coaching_sessions")
    .update({
      outcome: "not_happened",
      missed_reason: reasonTypeV,
      missed_reason_note: reasonNoteV,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/coach/dashboard");
  return data;
}

// --- Calendar: coaching_sessions (appointments) -------------------------

const createSessionSchema = z.object({
  studentId: uuidSchema,
  scheduledAt: z.string().min(1, "Görüşme zamanı zorunludur."),
  meetingUrl: nonEmptyText(2000, "Görüşme linki"),
});

export async function createCoachingSession(input: {
  studentId: string;
  scheduledAt: string;
  meetingUrl: string;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(createSessionSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, inputV.studentId);

  const { data, error } = await supabase
    .from("coaching_sessions")
    .insert({
      coach_id: user.id,
      student_id: inputV.studentId,
      scheduled_at: inputV.scheduledAt,
      meeting_url: inputV.meetingUrl,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/coach/dashboard");
  return data;
}

export async function deleteCoachingSession(sessionId: string) {
  await assertNotImpersonating();
  const sessionIdV = parseInput(uuidSchema, sessionId);
  const supabase = await createClient();
  const { error } = await supabase.from("coaching_sessions").delete().eq("id", sessionIdV);
  if (error) throw dbError(error);
  revalidatePath("/coach/dashboard");
}

// --- Coach notes ("Koç Notları" on the student detail page) ------------

const createCoachNoteSchema = z.object({
  studentId: uuidSchema,
  type: z.enum(["main_session", "check_in", "parent_meeting"]),
  content: nonEmptyText(5000, "Not içeriği"),
  guardianDescriptor: z.string().trim().max(200).nullable(),
  shareWithParent: z.boolean(),
});

export async function createCoachNote(input: {
  studentId: string;
  type: "main_session" | "check_in" | "parent_meeting";
  content: string;
  guardianDescriptor: string | null;
  shareWithParent: boolean;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(createCoachNoteSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, inputV.studentId);

  const { data, error } = await supabase
    .from("coach_notes")
    .insert({
      student_id: inputV.studentId,
      coach_id: user.id,
      type: inputV.type,
      content: inputV.content,
      guardian_descriptor: inputV.type === "parent_meeting" ? inputV.guardianDescriptor : null,
      parent_share_status: inputV.type !== "parent_meeting" && inputV.shareWithParent ? "pending" : "none",
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${inputV.studentId}`);
  return data;
}

// "Daha Fazla Yükle" on the student detail page's timeline -- the initial
// page.tsx load only fetches the most recent STUDENT_NOTES_PAGE_SIZE notes.
export async function getMoreStudentNotes(studentId: string, offset: number) {
  const studentIdV = parseInput(uuidSchema, studentId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("coach_notes")
    .select("*")
    .eq("student_id", studentIdV)
    .order("created_at", { ascending: false })
    .range(offset, offset + STUDENT_NOTES_PAGE_SIZE - 1);
  if (error) throw dbError(error);

  return data;
}

// Coach edits the note text after an admin requested a revision, and sends
// it back for approval -- the enforce_coach_note_share_workflow trigger
// only allows a coach to move status to 'pending' from 'none' or
// 'revision_requested', so this only succeeds on a revision-requested note.
export async function resubmitCoachNote(noteId: string, content: string) {
  await assertNotImpersonating();
  const noteIdV = parseInput(uuidSchema, noteId);
  const contentV = parseInput(nonEmptyText(5000, "Not içeriği"), content);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_notes")
    .update({ content: contentV, parent_share_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", noteIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${data.student_id}`);
  return data;
}

// --- Calendar: coach_calendar_blocks (personal time) ---------------------

const calendarBlockSchema = z.object({
  title: nonEmptyText(200, "Başlık"),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
});

export async function createCalendarBlock(input: { title: string; startAt: string; endAt: string }) {
  await assertNotImpersonating();
  const inputV = parseInput(calendarBlockSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("coach_calendar_blocks")
    .insert({ coach_id: user.id, title: inputV.title, start_at: inputV.startAt, end_at: inputV.endAt })
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/coach/dashboard");
  return data;
}

export async function deleteCalendarBlock(blockId: string) {
  await assertNotImpersonating();
  const blockIdV = parseInput(uuidSchema, blockId);
  const supabase = await createClient();
  const { error } = await supabase.from("coach_calendar_blocks").delete().eq("id", blockIdV);
  if (error) throw dbError(error);
  revalidatePath("/coach/dashboard");
}

// --- Daily checklist: coach_tasks ----------------------------------------

export type CoachTaskStatus = "pending" | "done" | "not_done" | "message_sent";

const createCoachTaskSchema = z.object({
  taskDate: z.string().min(1),
  title: nonEmptyText(200, "Başlık"),
  description: z.string().trim().max(2000).optional(),
  studentId: uuidSchema.nullable().optional(),
});

export async function createCoachTask(input: {
  taskDate: string;
  title: string;
  description?: string;
  studentId?: string | null;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(createCoachTaskSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("coach_tasks")
    .insert({
      coach_id: user.id,
      student_id: inputV.studentId ?? null,
      task_date: inputV.taskDate,
      title: inputV.title,
      description: inputV.description ?? null,
      source: "manual",
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/coach/dashboard");
  return data;
}

const coachTaskStatusSchema = z.enum(["pending", "done", "not_done", "message_sent"]);

// Shared postponement budget for coach_tasks -- a task can be pushed to a
// later day at most this many times, whether by dragging it (moveCoachTask)
// or by auto-rollover (updateCoachTaskStatus below). One counter, one cap,
// since both are "this task got pushed later" from the coach's perspective.
const MAX_TASK_POSTPONEMENTS = 2;

// Updates status and, for "not_done"/"message_sent", duplicates the task
// onto the next day -- guarded against re-rolling the same task twice if
// its status flips back and forth, and capped at MAX_TASK_POSTPONEMENTS
// total rollovers per chain so a forgotten task can't drift forever.
export async function updateCoachTaskStatus(taskId: string, status: CoachTaskStatus) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const statusV = parseInput(coachTaskStatusSchema, status);
  const supabase = await createClient();

  const { data: task, error: fetchError } = await supabase
    .from("coach_tasks")
    .select("*")
    .eq("id", taskIdV)
    .single();
  if (fetchError) throw dbError(fetchError);

  const { data: updated, error } = await supabase
    .from("coach_tasks")
    .update({ status: statusV, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);

  let rolloverChild = null;
  if (statusV === "not_done" || statusV === "message_sent") {
    const { data: existingChild } = await supabase
      .from("coach_tasks")
      .select("id")
      .eq("rolled_over_from", taskIdV)
      .maybeSingle();

    if (!existingChild && task.postponed_count < MAX_TASK_POSTPONEMENTS) {
      const { data: inserted, error: rolloverError } = await supabase
        .from("coach_tasks")
        .insert({
          coach_id: task.coach_id,
          student_id: task.student_id,
          task_date: addDaysISO(task.task_date, 1),
          title: task.title,
          description: task.description,
          source: "automation",
          rolled_over_from: taskIdV,
          postponed_count: task.postponed_count + 1,
        })
        .select("*")
        .single();
      if (rolloverError) throw dbError(rolloverError);
      rolloverChild = inserted;
    }
  }

  // Logged straight into notification HISTORY (status: "done") -- this is
  // a record of what happened, not an alert needing action, so it never
  // touches the active list or the sidebar's unread badge.
  if (statusV === "done") {
    const { error: notificationError } = await supabase.from("notifications").insert({
      coach_id: task.coach_id,
      student_id: task.student_id,
      type: "checklist_task_done",
      title: `Görev tamamlandı: ${task.title}`,
      status: "done",
      done_at: new Date().toISOString(),
    });
    if (notificationError) throw dbError(notificationError);
  }

  revalidatePath("/coach/dashboard");
  return { updated, rolloverChild };
}

// Cross-day drag-and-drop: persists both the new day and the new order
// within that day in one go. Shares MAX_TASK_POSTPONEMENTS with
// updateCoachTaskStatus's auto-rollover above -- see that constant's comment.
export async function moveCoachTask(taskId: string, newDate: string, orderIndex: number) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const newDateV = parseInput(z.string().min(1), newDate);
  const orderIndexV = parseInput(z.number().int().min(0), orderIndex);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: current, error: fetchError } = await supabase
    .from("coach_tasks")
    .select("task_date, postponed_count")
    .eq("id", taskIdV)
    .eq("coach_id", user.id)
    .single();
  if (fetchError) throw dbError(fetchError);

  const isDateChange = current.task_date !== newDateV;
  if (isDateChange && current.postponed_count >= MAX_TASK_POSTPONEMENTS) {
    throw new Error("Bu görev en fazla 2 kez ertelenebilir.");
  }

  const { error } = await supabase
    .from("coach_tasks")
    .update({
      task_date: newDateV,
      order_index: orderIndexV,
      postponed_count: isDateChange ? current.postponed_count + 1 : current.postponed_count,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskIdV)
    .eq("coach_id", user.id);
  if (error) throw dbError(error);
  revalidatePath("/coach/dashboard");
}

const orderListSchema = z.array(z.object({ id: uuidSchema, order_index: z.number().int().min(0) }));

export async function updateCoachTaskOrder(orders: { id: string; order_index: number }[]) {
  await assertNotImpersonating();
  const ordersV = parseInput(orderListSchema, orders);
  const supabase = await createClient();
  const results = await Promise.all(
    ordersV.map(({ id, order_index }) => supabase.from("coach_tasks").update({ order_index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw dbError(failed.error);
  revalidatePath("/coach/dashboard");
}

export async function deleteCoachTask(taskId: string) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const { error } = await supabase.from("coach_tasks").delete().eq("id", taskIdV);
  if (error) throw dbError(error);
  revalidatePath("/coach/dashboard");
}

// --- Student detail: Week Lock (Group 1 -- "Haftayı Kilitle") ------------

const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih.");

// One row per (student, week) -- see migration 0037. RLS already scopes
// week_locks writes to the coach's own roster (week_locks_coach_all), so
// no extra roster check is needed here beyond what the insert/delete
// itself will reject.
export async function isWeekLocked(studentId: string, weekStart: string): Promise<boolean> {
  const studentIdV = parseInput(uuidSchema, studentId);
  const weekStartV = parseInput(weekStartSchema, weekStart);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("week_locks")
    .select("id")
    .eq("student_id", studentIdV)
    .eq("week_start_date", weekStartV)
    .maybeSingle();
  if (error) throw dbError(error);
  return data !== null;
}

export async function lockWeek(studentId: string, weekStart: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const weekStartV = parseInput(weekStartSchema, weekStart);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase
    .from("week_locks")
    .upsert({ student_id: studentIdV, week_start_date: weekStartV }, { onConflict: "student_id,week_start_date" });
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
}

export async function unlockWeek(studentId: string, weekStart: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const weekStartV = parseInput(weekStartSchema, weekStart);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase
    .from("week_locks")
    .delete()
    .eq("student_id", studentIdV)
    .eq("week_start_date", weekStartV);
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
}

// --- Student detail: Program tab week navigation --------------------------

// Read-only fetch for the Program tab's week switcher -- RLS already
// scopes this to the coach's own assigned students via
// student_tasks_coach_all, but a coach shouldn't be able to page through
// an arbitrary student's schedule, so double-check the roster link too.
export async function getStudentTasksForWeek(studentId: string, weekStart: string, weekEnd: string) {
  const studentIdV = parseInput(uuidSchema, studentId);
  const weekStartV = parseInput(weekStartSchema, weekStart);
  const weekEndV = parseInput(weekStartSchema, weekEnd);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_tasks")
    .select("*")
    .eq("student_id", studentIdV)
    .gte("task_date", weekStartV)
    .lte("task_date", weekEndV)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error);
  if (!data || data.length === 0) return [];

  // Mirrors schedule/page.tsx's initial-load join -- without this, a task's
  // resource_ids silently disappear after any Prev/Next-week navigation
  // (only the first server-rendered load ever populated them).
  const { data: taskResourceRows, error: resError } = await supabase
    .from("task_resources")
    .select("task_id, resource_id, order_index")
    .in("task_id", data.map((t) => t.id))
    .order("order_index", { ascending: true });
  if (resError) throw dbError(resError);

  const resourceIdsByTask = new Map<string, string[]>();
  for (const row of taskResourceRows ?? []) {
    const list = resourceIdsByTask.get(row.task_id) ?? [];
    list.push(row.resource_id);
    resourceIdsByTask.set(row.task_id, list);
  }

  return data.map((t) => ({ ...t, resource_ids: resourceIdsByTask.get(t.id) ?? [] }));
}

// --- Student Events ("Zaman Blokları") -----------------------------------
//
// Non-task calendar entries tied to one student's schedule -- school
// hours, sports, a coach meeting slot -- kept in their own table
// (0066_student_events.sql) entirely separate from student_tasks so a
// time block never gets a status checkbox, D/Y/B stats, or drag-to-
// "Completed" semantics on the schedule board. Distinct from the
// pre-existing coach_calendar_blocks (createCalendarBlock/deleteCalendarBlock
// above), which is the coach's OWN personal calendar with no student_id
// at all -- these are two unrelated concepts that happen to share the
// word "calendar".
// StudentEventType and its display-label map live in lib/student-events.ts,
// NOT here -- a "use server" file may only export async functions, and
// STUDENT_EVENT_TYPE_LABELS is a plain object, so it can't be exported
// from this module at all (re-exporting the type below is fine; type
// exports are erased entirely before runtime).
export type { StudentEventType } from "@/lib/student-events";
export type StudentEvent = {
  id: string;
  student_id: string;
  coach_id: string;
  title: string;
  description: string | null;
  event_type: StudentEventType;
  event_date: string;
  start_time: string;
  end_time: string;
  order_index: number;
  is_locked: boolean;
};

const studentEventTypeSchema = z.enum(["meeting", "school", "sports", "personal", "other"]);
// HH:MM only -- the <input type="time"> the UI uses never produces
// seconds, and the column itself is a plain `time`, not a timestamp, so
// there's no timezone concern here at all (unlike coach_calendar_blocks'
// start_at/end_at, which are real timestamptz values on the coach's own
// calendar).
const timeOnlySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçersiz saat.");
const studentEventInputSchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    eventType: studentEventTypeSchema,
    eventDate: weekStartSchema,
    startTime: timeOnlySchema,
    endTime: timeOnlySchema,
    // Only set when the caller is placing this event at a specific spot in
    // a day's unified [task|event] drag order (create/duplicate append to
    // the end, a drag-driven move always passes it) -- omitted, the column
    // default (0) applies, same as a freshly-created student_tasks row.
    orderIndex: z.number().int().min(0).optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: "Bitiş saati başlangıçtan sonra olmalı.", path: ["endTime"] });

export async function getStudentEventsForWeek(studentId: string, weekStart: string, weekEnd: string): Promise<StudentEvent[]> {
  const studentIdV = parseInput(uuidSchema, studentId);
  const weekStartV = parseInput(weekStartSchema, weekStart);
  const weekEndV = parseInput(weekStartSchema, weekEnd);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_events")
    .select("*")
    .eq("student_id", studentIdV)
    .gte("event_date", weekStartV)
    .lte("event_date", weekEndV)
    .order("order_index", { ascending: true });
  if (error) throw dbError(error);
  return (data ?? []) as StudentEvent[];
}

export async function createStudentEvent(
  studentId: string,
  input: { description?: string | null; eventType: StudentEventType; eventDate: string; startTime: string; endTime: string; orderIndex?: number },
): Promise<StudentEvent> {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const inputV = parseInput(studentEventInputSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  // Same append-to-bottom fix as buildTaskRows for tasks -- a plain "+"
  // new time block used to always default to order_index 0 (the column
  // default) just like a new task did. orderIndex stays an explicit
  // override for callers that already know the right spot (duplicate,
  // drag-driven creation), computed here only when they didn't pass one.
  let orderIndex = inputV.orderIndex;
  if (orderIndex === undefined) {
    const startOrderByDate = await nextOrderIndexByDate(supabase, studentIdV, [inputV.eventDate]);
    orderIndex = startOrderByDate.get(inputV.eventDate)!;
  }

  const { data, error } = await supabase
    .from("student_events")
    .insert({
      student_id: studentIdV,
      coach_id: user.id,
      title: STUDENT_EVENT_TYPE_LABELS[inputV.eventType],
      description: inputV.description || null,
      event_type: inputV.eventType,
      event_date: inputV.eventDate,
      start_time: inputV.startTime,
      end_time: inputV.endTime,
      order_index: orderIndex,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data as StudentEvent;
}

export async function updateStudentEvent(
  studentId: string,
  eventId: string,
  input: { description?: string | null; eventType: StudentEventType; eventDate: string; startTime: string; endTime: string; orderIndex?: number },
): Promise<StudentEvent> {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const eventIdV = parseInput(uuidSchema, eventId);
  const inputV = parseInput(studentEventInputSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_events")
    .update({
      title: STUDENT_EVENT_TYPE_LABELS[inputV.eventType],
      description: inputV.description || null,
      event_type: inputV.eventType,
      event_date: inputV.eventDate,
      start_time: inputV.startTime,
      end_time: inputV.endTime,
      // Only touched when the caller actually repositioned this event (a
      // drag) -- a plain "edit type/description/time" save from the dialog
      // must leave its place in the day's combined order untouched.
      ...(inputV.orderIndex !== undefined ? { order_index: inputV.orderIndex } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventIdV)
    .eq("student_id", studentIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data as StudentEvent;
}

export async function updateStudentEventOrder(studentId: string, orders: { id: string; order_index: number }[]) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const ordersV = parseInput(orderListSchema, orders);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);
  const results = await Promise.all(
    ordersV.map(({ id, order_index }) => supabase.from("student_events").update({ order_index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw dbError(failed.error);
  revalidatePath(`/coach/students/${studentIdV}/schedule`);
}

// Prevents this one time block from being dragged -- enforced client-side
// via useSortable({ disabled: event.is_locked }) in EventCard; everything
// else in the day's combined sequence still drags freely around it.
export async function setEventLocked(studentId: string, eventId: string, locked: boolean) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const eventIdV = parseInput(uuidSchema, eventId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);
  const { data, error } = await supabase
    .from("student_events")
    .update({ is_locked: locked, updated_at: new Date().toISOString() })
    .eq("id", eventIdV)
    .eq("student_id", studentIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);
  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data as StudentEvent;
}

export async function deleteStudentEvent(studentId: string, eventId: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const eventIdV = parseInput(uuidSchema, eventId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase.from("student_events").delete().eq("id", eventIdV).eq("student_id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}/schedule`);
}

// Past-weeks archive ("Geçmiş Programlar") -- distinct Monday-start weeks
// (within the last 12 months) that actually have assigned tasks, most
// recent first, so the coach can jump straight to a week that has
// something in it instead of paging prev/next one at a time. Grouped in
// JS rather than a SQL GROUP BY -- supabase-js has no clean way to
// express date_trunc('week', ...) via the query builder, and per-student
// task volume within this window is small enough that fetching every
// task_date and grouping here is simpler than an RPC. The 12-month bound
// keeps that true as students accrue years of history -- older weeks
// still exist in the DB, they just drop out of this dropdown.
function isoDateMonthsAgo(months: number) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function getPastWeeksForStudent(studentId: string): Promise<{ weekStart: string; taskCount: number }[]> {
  const studentIdV = parseInput(uuidSchema, studentId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_tasks")
    .select("task_date")
    .eq("student_id", studentIdV)
    .gte("task_date", isoDateMonthsAgo(12));
  if (error) throw dbError(error);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const weekStart = mondayOf(row.task_date);
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([weekStart, taskCount]) => ({ weekStart, taskCount }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

// --- Student detail: Haftalık Görev Ata (task assignment) ---------------

export type AssignableTaskType = "question_bank" | "topic_study" | "branch_exam" | "general_exam" | "video";
export type VideoLink = { url: string; title: string | null };

type AssignTaskInput = {
  taskType: AssignableTaskType;
  courseId?: string | null;
  topicId?: string | null;
  // 0 to N resources, in the order the coach added them (task_resources.order_index).
  resourceIds?: string[];
  totalCount?: number | null;
  durationMinutes?: number | null;
  videoLinks?: VideoLink[];
  generalExamTrack?: "tyt" | "ayt" | null;
  generalExamPublisher?: string | null;
  branchExamPublisher?: string | null;
};

const videoLinkSchema = z.object({ url: z.string().trim().max(2000), title: z.string().trim().max(300).nullable() });

const assignTaskInputSchema = z.object({
  taskType: z.enum(["question_bank", "topic_study", "branch_exam", "general_exam", "video"]),
  courseId: z.string().trim().max(60).nullable().optional(),
  topicId: z.string().trim().max(60).nullable().optional(),
  resourceIds: z.array(uuidSchema).optional(),
  totalCount: z.number().int().min(0).max(10000).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  videoLinks: z.array(videoLinkSchema).optional(),
  generalExamTrack: z.enum(["tyt", "ayt"]).nullable().optional(),
  generalExamPublisher: z.string().trim().max(200).nullable().optional(),
  branchExamPublisher: z.string().trim().max(200).nullable().optional(),
});

// A day's Görevler section is one combined [task|event] order_index
// sequence rendered/dragged across two tables (see combinedItemIdsForDay,
// schedule-board.tsx) -- Rutinler tasks share the same student_tasks.
// order_index column but are never compared against Görevler items in
// either section's own render (each filters to its own subset before
// sorting), so a single "max across everything for this date, +1" is
// always >= the correct value for WHICHEVER section a new row belongs to,
// never a collision. Shared by every task/event creation path below so
// "new item lands at the bottom" is one correct implementation, not
// reimplemented (or missed) per call site.
async function nextOrderIndexByDate(supabase: SupabaseClient, studentId: string, dates: string[]): Promise<Map<string, number>> {
  const uniqueDates = [...new Set(dates)];
  const [{ data: taskRows }, { data: eventRows }] = await Promise.all([
    supabase.from("student_tasks").select("task_date, order_index").eq("student_id", studentId).in("task_date", uniqueDates),
    supabase.from("student_events").select("event_date, order_index").eq("student_id", studentId).in("event_date", uniqueDates),
  ]);
  const maxByDate = new Map<string, number>();
  for (const r of taskRows ?? []) maxByDate.set(r.task_date, Math.max(maxByDate.get(r.task_date) ?? -1, r.order_index));
  for (const r of eventRows ?? []) maxByDate.set(r.event_date, Math.max(maxByDate.get(r.event_date) ?? -1, r.order_index));

  const startByDate = new Map<string, number>();
  for (const d of uniqueDates) startByDate.set(d, (maxByDate.get(d) ?? -1) + 1);
  return startByDate;
}

// Builds one insertable row per (date x video-link) pair. For every
// task type except "video" this is just one row per date, video_links
// carried as-is (unchanged from before). For "video" with N links, each
// date gets N separate rows -- one link each, in the order the coach
// added them -- so the student gets N independently checkable cards
// instead of one card bundling every video. startOrderByDate seeds each
// date's first new row at the current append position (nextOrderIndexByDate
// above); multiple rows sharing a date (the multi-video-link case) get
// consecutive indexes after that, incremented locally as they're built.
function buildTaskRows(studentId: string, coachId: string, taskDates: string[], input: AssignTaskInput, startOrderByDate: Map<string, number>) {
  const title =
    input.taskType === "general_exam"
      ? buildGeneralExamTitle(input.generalExamTrack, input.generalExamPublisher)
      : input.taskType === "branch_exam"
        ? buildBranchExamTitle(input.courseId, input.topicId, input.branchExamPublisher)
        : buildTaskTitle(input.courseId, input.topicId);

  const videoLinkGroups: VideoLink[][] =
    input.taskType === "video" && input.videoLinks && input.videoLinks.length > 0
      ? input.videoLinks.map((link) => [link])
      : [input.videoLinks ?? []];

  const rows: {
    student_id: string;
    coach_id: string;
    task_date: string;
    task_type: AssignableTaskType;
    title: string;
    course_id: string | null;
    topic_id: string | null;
    total_count: number | null;
    duration_minutes: number | null;
    video_links: VideoLink[];
    order_index: number;
    is_coach_assigned: true;
    is_approved_by_coach: true;
  }[] = [];

  for (const taskDate of taskDates) {
    let nextOrder = startOrderByDate.get(taskDate) ?? 0;
    for (const videoLinks of videoLinkGroups) {
      rows.push({
        student_id: studentId,
        coach_id: coachId,
        task_date: taskDate,
        task_type: input.taskType,
        title,
        course_id: input.courseId || null,
        topic_id: input.topicId || null,
        total_count: input.totalCount ?? null,
        duration_minutes: input.durationMinutes ?? null,
        video_links: videoLinks,
        order_index: nextOrder++,
        is_coach_assigned: true,
        // A coach-originated task needs no separate review -- see
        // "Soft Coach Approval" in app/student/actions.ts's
        // createRichCustomTask for the student-created counterpart,
        // which defaults to false (pending) instead.
        is_approved_by_coach: true,
      });
    }
  }
  return rows;
}

// Recomputes one (student, course, topic) bucket in student_topic_stats
// (migration 0072) from scratch -- called after any write that could
// change a task's contribution to it: a status change, a count edit, a
// course/topic reassignment, or a coach approval. Mirrors
// recomputeDailyStats' call-site-driven, self-healing idiom
// (app/student/actions.ts), one level up. A null courseId (e.g. a
// calendar-only "Diğer" block, or a Genel Deneme, which has no course_id)
// has no bucket to recompute -- every call site below checks for that
// before calling this.
async function recomputeTopicStats(supabase: SupabaseClient, studentId: string, courseId: string, topicId: string | null) {
  const { error } = await supabase.rpc("recompute_student_topic_stats", {
    p_student_id: studentId,
    p_course_id: courseId,
    p_topic_id: topicId ?? "karma",
  });
  if (error) throw dbError(error);
}

// Links the same ordered resource list to every given task id (one
// created task per date/video-link pair shares the coach's one resource
// pick). No-ops when there's nothing to link.
async function linkTaskResources(
  supabase: SupabaseClient,
  taskIds: string[],
  resourceIds: string[] | undefined,
) {
  if (!resourceIds || resourceIds.length === 0 || taskIds.length === 0) return;
  const rows = taskIds.flatMap((taskId) =>
    resourceIds.map((resourceId, orderIndex) => ({ task_id: taskId, resource_id: resourceId, order_index: orderIndex })),
  );
  const { error } = await supabase.from("task_resources").insert(rows);
  if (error) throw dbError(error);
}

// student_tasks_coach_all's WITH CHECK already verifies both coach_id
// ownership and the coach_students link -- re-checked explicitly here too
// (requireCoachAccess) per the Security Hardening double-layer-auth
// requirement, rather than leaning on that WITH CHECK as the only gate.
// Returns an array -- a "video" task with multiple links produces more
// than one row from a single call.
export async function assignTaskToStudent(input: AssignTaskInput & { studentId: string; taskDate: string }) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, input.studentId);
  const taskDateV = parseInput(weekStartSchema, input.taskDate);
  const inputV = parseInput(assignTaskInputSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const startOrderByDate = await nextOrderIndexByDate(supabase, studentIdV, [taskDateV]);
  const rows = buildTaskRows(studentIdV, user.id, [taskDateV], inputV, startOrderByDate);
  const { data, error } = await supabase.from("student_tasks").insert(rows).select("*");
  if (error) throw dbError(error);

  await linkTaskResources(supabase, data.map((t) => t.id), inputV.resourceIds);

  revalidatePath(`/coach/students/${studentIdV}`);
  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data.map((t) => ({ ...t, resource_ids: inputV.resourceIds ?? [] }));
}

// Inserts the same task shape across every date given, in a single
// insert -- used both by "Hızlı Rutinler" (one click, every day of the
// week) and by the general create drawer's multi-day picker (coach
// checks Mon/Wed/Fri, one submit). Each resulting row is independent
// afterward: editing one day's card never touches the others. A
// "video" task with N links across M days produces N x M rows.
export async function assignRoutineToWeek(input: AssignTaskInput & { studentId: string; taskDates: string[] }) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, input.studentId);
  const taskDatesV = parseInput(z.array(weekStartSchema).min(1, "En az bir gün gerekli."), input.taskDates);
  const inputV = parseInput(assignTaskInputSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const startOrderByDate = await nextOrderIndexByDate(supabase, studentIdV, taskDatesV);
  const rows = buildTaskRows(studentIdV, user.id, taskDatesV, inputV, startOrderByDate);
  const { data, error } = await supabase.from("student_tasks").insert(rows).select("*");
  if (error) throw dbError(error);

  await linkTaskResources(supabase, data.map((t) => t.id), inputV.resourceIds);

  revalidatePath(`/coach/students/${studentIdV}`);
  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data.map((t) => ({ ...t, resource_ids: inputV.resourceIds ?? [] }));
}

// --- Student detail: schedule workspace (edit/duplicate/move/delete) -----

const updateAssignedTaskSchema = z.object({
  taskType: z.enum(["question_bank", "topic_study", "branch_exam", "general_exam", "video"]).optional(),
  courseId: z.string().trim().max(60).nullable().optional(),
  topicId: z.string().trim().max(60).nullable().optional(),
  resourceIds: z.array(uuidSchema).optional(),
  totalCount: z.number().int().min(0).max(10000).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  videoLinks: z.array(videoLinkSchema).optional(),
  generalExamTrack: z.enum(["tyt", "ayt"]).nullable().optional(),
  generalExamPublisher: z.string().trim().max(200).nullable().optional(),
  branchExamPublisher: z.string().trim().max(200).nullable().optional(),
});

// Edits always operate on the ONE existing row -- a "video" task's links
// don't get re-split here even if the coach adds more (that only happens
// at create time, via buildTaskRows); editing just updates this row's own
// video_links array, same as any other task's video links always have.
export async function updateAssignedTask(
  studentId: string,
  taskId: string,
  input: {
    taskType?: AssignableTaskType;
    courseId?: string | null;
    topicId?: string | null;
    resourceIds?: string[];
    totalCount?: number | null;
    durationMinutes?: number | null;
    videoLinks?: VideoLink[];
    generalExamTrack?: "tyt" | "ayt" | null;
    generalExamPublisher?: string | null;
    branchExamPublisher?: string | null;
  },
) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const input_ = parseInput(updateAssignedTaskSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  // Read before the update -- if this edit reassigns course/topic, the
  // OLD bucket (course_id/topic_id as they stood before this write) would
  // otherwise keep a stale count forever, since nothing else would ever
  // re-touch it once the row moves to a different bucket.
  const { data: taskBefore } = await supabase.from("student_tasks").select("course_id, topic_id").eq("id", taskIdV).maybeSingle();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input_.taskType !== undefined) patch.task_type = input_.taskType;
  if (input_.courseId !== undefined) patch.course_id = input_.courseId || null;
  if (input_.topicId !== undefined) patch.topic_id = input_.topicId || null;
  if (input_.totalCount !== undefined) patch.total_count = input_.totalCount;
  if (input_.durationMinutes !== undefined) patch.duration_minutes = input_.durationMinutes;
  if (input_.videoLinks !== undefined) patch.video_links = input_.videoLinks;
  if (input_.taskType === "general_exam") {
    patch.title = buildGeneralExamTitle(input_.generalExamTrack, input_.generalExamPublisher);
  } else if (
    input_.taskType === "branch_exam" &&
    (input_.courseId !== undefined || input_.topicId !== undefined || input_.branchExamPublisher !== undefined)
  ) {
    patch.title = buildBranchExamTitle(input_.courseId, input_.topicId, input_.branchExamPublisher);
  } else if (input_.courseId !== undefined || input_.topicId !== undefined) {
    patch.title = buildTaskTitle(input_.courseId, input_.topicId);
  }

  const { data, error } = await supabase.from("student_tasks").update(patch).eq("id", taskIdV).select("*").single();
  if (error) throw dbError(error);

  if (taskBefore?.course_id) await recomputeTopicStats(supabase, studentIdV, taskBefore.course_id, taskBefore.topic_id);
  if (data.course_id) await recomputeTopicStats(supabase, studentIdV, data.course_id, data.topic_id);

  let resourceIds = input_.resourceIds;
  if (resourceIds !== undefined) {
    const { error: deleteError } = await supabase.from("task_resources").delete().eq("task_id", taskIdV);
    if (deleteError) throw dbError(deleteError);
    await linkTaskResources(supabase, [taskIdV], resourceIds);
  } else {
    const { data: existing, error: readError } = await supabase
      .from("task_resources")
      .select("resource_id")
      .eq("task_id", taskIdV)
      .order("order_index", { ascending: true });
    if (readError) throw dbError(readError);
    resourceIds = (existing ?? []).map((r) => r.resource_id);
  }

  revalidatePath(`/coach/students/${studentIdV}`);
  return { ...data, resource_ids: resourceIds };
}

export async function duplicateAssignedTask(studentId: string, taskId: string, targetDate?: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const targetDateV = targetDate === undefined ? undefined : parseInput(weekStartSchema, targetDate);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data: original, error: fetchError } = await supabase.from("student_tasks").select("*").eq("id", taskIdV).single();
  if (fetchError) throw dbError(fetchError);

  const { data: originalResources } = await supabase
    .from("task_resources")
    .select("resource_id, order_index")
    .eq("task_id", taskIdV)
    .order("order_index", { ascending: true });

  const targetDateForOrder = targetDateV ?? original.task_date;
  const startOrderByDate = await nextOrderIndexByDate(supabase, studentIdV, [targetDateForOrder]);

  const { data, error } = await supabase
    .from("student_tasks")
    .insert({
      student_id: original.student_id,
      coach_id: user.id,
      task_date: targetDateForOrder,
      task_type: original.task_type,
      title: original.title,
      course_id: original.course_id,
      topic_id: original.topic_id,
      total_count: original.total_count,
      duration_minutes: original.duration_minutes,
      video_links: original.video_links,
      order_index: startOrderByDate.get(targetDateForOrder)!,
      is_coach_assigned: true,
      is_approved_by_coach: true,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  const resourceIds = (originalResources ?? []).map((r) => r.resource_id);
  await linkTaskResources(supabase, [data.id], resourceIds);

  revalidatePath(`/coach/students/${studentIdV}`);
  return { ...data, resource_ids: resourceIds };
}

// --- Soft Coach Approval (student self-logged entries) -------------------
//
// A student's own self-created task (via "Ek Çalışma Ekle") starts
// is_approved_by_coach: false -- it always shows up in the student's own
// daily log immediately, but is excluded from Kaynak Takibi, Gelişim
// Haritası, and Karne until a coach reviews it here. Coach-assigned
// tasks are inserted already-approved (buildTaskRows/duplicateAssignedTask
// above) and never appear in this list.

export type PendingStudentTask = {
  id: string;
  title: string;
  task_type: string;
  course_id: string | null;
  topic_id: string | null;
  task_date: string;
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
};

// Roster-wide (not one student) so the coach has a single place to catch
// up on every pending entry across all their students -- mirrors the
// dashboard alert panel's own "across the whole roster" convention.
export async function getPendingStudentTasks(): Promise<(PendingStudentTask & { studentId: string; studentName: string | null })[]> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: rosterLinks } = await supabase.from("coach_students").select("student_id").eq("coach_id", user.id);
  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  if (studentIds.length === 0) return [];

  const [{ data: tasks }, { data: profiles }] = await Promise.all([
    supabase
      .from("student_tasks")
      .select("id, student_id, title, task_type, course_id, topic_id, task_date, total_count, correct_count, wrong_count, empty_count, duration_minutes")
      .in("student_id", studentIds)
      .eq("is_coach_assigned", false)
      .eq("is_approved_by_coach", false)
      // A previously-rejected task stays false/false forever (rejection
      // is soft now, see rejectStudentTask) -- without this it would keep
      // reappearing in the review queue every time this list is fetched.
      .is("rejected_at", null)
      .order("task_date", { ascending: false }),
    supabase.from("profiles").select("id, full_name").in("id", studentIds),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  return (tasks ?? []).map((t) => ({ ...t, studentId: t.student_id, studentName: nameById.get(t.student_id) ?? null }));
}

// Best-effort, immediate counterpart to syncPendingApprovalNotifications'
// own lazy auto-resolve step below -- called from approveStudentTask/
// rejectStudentTask so the matching notification clears the moment the
// coach acts, instead of waiting for the next dashboard load's sync pass.
// Never throws: a notification-table hiccup must not fail the actual
// approve/reject write it's attached to.
async function resolvePendingApprovalNotification(supabase: SupabaseClient, coachId: string, taskId: string) {
  await supabase
    .from("notifications")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("coach_id", coachId)
    .eq("type", "pending_task_approval")
    .eq("reference_id", taskId)
    .eq("status", "active");
}

// Discriminated result for approve/reject instead of throw-on-not-found --
// a student deleting their own pending task in the same window the coach
// is reviewing it is a normal race, not an application error, so the
// caller can tell "the task is simply gone/already resolved" apart from
// a genuine failure (network, RLS, validation) and react accordingly
// (resync its local list + a calm toast) instead of a generic error
// banner. Genuine errors still throw, same as every other action here.
export type ApprovalActionResult<T> = { success: true; data: T } | { success: false; code: "ALREADY_PROCESSED" };

export async function approveStudentTask(taskId: string): Promise<ApprovalActionResult<Record<string, unknown>>> {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select("student_id, is_coach_assigned, is_approved_by_coach")
    .eq("id", taskIdV)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  // Gone entirely (student deleted it) -- not a real error, just a race
  // the coach's own already-rendered list hasn't caught up to yet.
  if (!existing) return { success: false, code: "ALREADY_PROCESSED" };
  await requireCoachAccess(supabase, user.id, existing.student_id);
  // Already approved (a second tab, or two coaches on a shared roster)
  // or coach-assigned outright -- either way, no longer "pending".
  if (existing.is_coach_assigned || existing.is_approved_by_coach) {
    return { success: false, code: "ALREADY_PROCESSED" };
  }

  // student_tasks_coach_all's own WITH CHECK requires coach_id = auth.uid()
  // on any coach-authored write -- a student's self-created row has
  // coach_id: null, so approving it must also claim coach_id here or the
  // UPDATE is silently rejected by RLS (verified via role-simulation).
  // This is also the right semantics: once approved, the row is under
  // this coach's oversight, same as any is_coach_assigned row already is.
  // prevent_student_task_core_tampering (0058/0060) separately allows
  // this exact combination, since requireCoachAccess above already
  // confirmed the same coach_students link the trigger itself re-checks.
  //
  // The extra .eq("is_approved_by_coach", false) is an optimistic-
  // concurrency guard against the exact window between the SELECT above
  // and this UPDATE -- if another request approved (or the student
  // deleted) the row in that gap, this affects 0 rows instead of
  // silently re-approving/resurrecting it, and .select() (no .single())
  // lets that show up as an empty array rather than a thrown "no rows".
  const { data, error } = await supabase
    .from("student_tasks")
    .update({ is_approved_by_coach: true, coach_id: user.id, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .eq("is_approved_by_coach", false)
    .select("*");
  if (error) throw dbError(error);
  if (!data || data.length === 0) return { success: false, code: "ALREADY_PROCESSED" };

  // Approval is exactly what flips this row from "not yet counted" to
  // "counted" (see the counting rule comment on isCompletedTask in
  // app/coach/students/[id]/page.tsx) -- the bucket it belongs to must be
  // resynced now, not just on the next unrelated write to that topic.
  if (data[0].course_id) await recomputeTopicStats(supabase, existing.student_id, data[0].course_id, data[0].topic_id);

  await resolvePendingApprovalNotification(supabase, user.id, taskIdV);

  revalidatePath(`/coach/students/${existing.student_id}`);
  revalidatePath("/coach/dashboard");
  return { success: true, data: data[0] };
}

// Rejects a student's own pending self-created entry -- there's nothing
// to "un-approve" (it was never approved), so this simply deletes the
// row, exactly like the student's own "delete custom task" action would.
// Guarded against ever touching a coach-assigned or already-approved
// task even if a stale/forged id is passed in, since those are no longer
// "pending" by definition and this is a destructive action.
export async function rejectStudentTask(taskId: string): Promise<ApprovalActionResult<{ id: string }>> {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select("student_id, is_coach_assigned, is_approved_by_coach")
    .eq("id", taskIdV)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  if (!existing) return { success: false, code: "ALREADY_PROCESSED" };
  await requireCoachAccess(supabase, user.id, existing.student_id);

  if (existing.is_coach_assigned || existing.is_approved_by_coach) {
    return { success: false, code: "ALREADY_PROCESSED" };
  }

  // Soft-reject, not a hard DELETE (UX audit finding): the row used to
  // just vanish with no explanation -- the student would notice their own
  // logged work missing later with no way to know why. Marking it instead
  // keeps it visible on the student's own task board with a reason (see
  // task-card.tsx's rejected-badge rendering), and it's still excluded
  // from getPendingStudentTasks (.is("rejected_at", null)) so it won't
  // keep reappearing in the coach's own review queue. The student can
  // still delete it themselves afterward via the existing self-delete
  // policy, same as any other self-created task.
  //
  // student_tasks_coach_all's WITH CHECK requires coach_id = auth.uid()
  // on any coach-authored write, same as approveStudentTask above -- a
  // student's self-created row has coach_id: null, so this UPDATE must
  // also claim coach_id or RLS silently rejects it (verified via
  // role-simulation: omitting this raised "new row violates row-level
  // security policy").
  //
  // Same optimistic-concurrency guard as approveStudentTask above -- if
  // the student deleted it (or it got approved elsewhere) in the window
  // between the SELECT and this UPDATE, this affects 0 rows instead of
  // throwing on an already-gone row.
  const { data, error } = await supabase
    .from("student_tasks")
    .update({
      rejected_at: new Date().toISOString(),
      rejection_reason: "Koçun bu kaydı incelemedi ve kaldırdı.",
      coach_id: user.id,
    })
    .eq("id", taskIdV)
    .eq("is_coach_assigned", false)
    .eq("is_approved_by_coach", false)
    .select("id");
  if (error) throw dbError(error);
  if (!data || data.length === 0) return { success: false, code: "ALREADY_PROCESSED" };

  await resolvePendingApprovalNotification(supabase, user.id, taskIdV);

  revalidatePath(`/coach/students/${existing.student_id}`);
  revalidatePath("/student");
  revalidatePath("/coach/dashboard");
  return { success: true, data: { id: taskIdV } };
}

// Bridges the dashboard's live pending-approvals list (getPendingStudentTasks
// above) into the persistent notifications table (0061), so a new self-
// created student entry also shows up in Bildirimler and the sidebar's
// unread badge -- not just the dashboard's own pending-approvals card.
// Called from app/coach/dashboard/page.tsx on every non-impersonating
// load, reusing the SAME pending list the dashboard just fetched rather
// than re-querying student_tasks a second time here.
//
// Deduped by reference_id (student_tasks.id): a task is only ever
// notified once, ever, whether the coach later dismisses it manually or
// approves it -- the pending-approvals card itself stays the always-
// current source of truth either way, this is just its notification-side
// echo. An active notification whose task is no longer pending (approved
// or deleted) is auto-flipped to done here too, so approving straight
// from the dashboard doesn't leave a stale notification behind.
//
// Best-effort, matching syncThresholdNotifications' own convention
// (app/coach/notifications/page.tsx): errors here are swallowed rather
// than thrown, since this runs unguarded during a page render and must
// never be able to break the dashboard itself.
export async function syncPendingApprovalNotifications(
  pending: (PendingStudentTask & { studentId: string; studentName: string | null })[],
) {
  await assertNotImpersonating();
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existingRows } = await supabase
    .from("notifications")
    .select("reference_id, status")
    .eq("coach_id", user.id)
    .eq("type", "pending_task_approval")
    .not("reference_id", "is", null);

  const notifiedIds = new Set((existingRows ?? []).map((r) => r.reference_id));
  const toInsert = pending
    .filter((t) => !notifiedIds.has(t.id))
    .map((t) => ({
      coach_id: user.id,
      student_id: t.studentId,
      type: "pending_task_approval" as const,
      reference_id: t.id,
      title: `${t.studentName ?? "Öğrenci"} onay bekleyen bir kayıt ekledi: ${t.title}`,
      status: "active" as const,
    }));
  if (toInsert.length > 0) {
    await supabase.from("notifications").insert(toInsert);
  }

  const pendingIds = new Set(pending.map((t) => t.id));
  const toResolve = (existingRows ?? [])
    .filter((r) => r.status === "active" && r.reference_id && !pendingIds.has(r.reference_id))
    .map((r) => r.reference_id!);
  if (toResolve.length > 0) {
    await supabase
      .from("notifications")
      .update({ status: "done", done_at: new Date().toISOString() })
      .eq("coach_id", user.id)
      .eq("type", "pending_task_approval")
      .in("reference_id", toResolve);
  }
}

export async function moveAssignedTask(studentId: string, taskId: string, newDate: string, orderIndex: number) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const newDateV = parseInput(weekStartSchema, newDate);
  const orderIndexV = parseInput(z.number().int().min(0), orderIndex);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);
  const { error } = await supabase
    .from("student_tasks")
    .update({ task_date: newDateV, order_index: orderIndexV, updated_at: new Date().toISOString() })
    .eq("id", taskIdV);
  if (error) throw dbError(error);
  revalidatePath(`/coach/students/${studentIdV}`);
}

export type AssignedTaskStatus = "pending" | "done" | "half_done" | "not_done";
const assignedTaskStatusSchema = z.enum(["pending", "done", "half_done", "not_done"]);

// Lets the coach mark a card Yapıldı/Yarım/Yapılmadı directly, without
// waiting on the student to check it off themselves.
export async function updateAssignedTaskStatus(studentId: string, taskId: string, status: AssignedTaskStatus) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const statusV = parseInput(assignedTaskStatusSchema, status);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);
  const { data, error } = await supabase
    .from("student_tasks")
    .update({ status: statusV, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);
  if (data.course_id) await recomputeTopicStats(supabase, studentIdV, data.course_id, data.topic_id);
  revalidatePath(`/coach/students/${studentIdV}`);
  return data;
}

// Prevents this one task from being dragged -- enforced client-side via
// useSortable({ disabled: task.is_locked }) in KanbanTaskCard; everything
// else in the day's combined sequence still drags freely around it.
export async function setTaskLocked(studentId: string, taskId: string, locked: boolean) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);
  const { data, error } = await supabase
    .from("student_tasks")
    .update({ is_locked: locked, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);
  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data;
}

export async function updateAssignedTaskOrder(studentId: string, orders: { id: string; order_index: number }[]) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const ordersV = parseInput(orderListSchema, orders);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);
  const results = await Promise.all(
    ordersV.map(({ id, order_index }) => supabase.from("student_tasks").update({ order_index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw dbError(failed.error);
  revalidatePath(`/coach/students/${studentIdV}`);
}

export async function deleteAssignedTask(studentId: string, taskId: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  // Read before the delete -- need course_id/topic_id to resync that
  // bucket afterward, and the row won't exist to read anymore once gone.
  const { data: existing } = await supabase.from("student_tasks").select("course_id, topic_id").eq("id", taskIdV).maybeSingle();

  const { error } = await supabase.from("student_tasks").delete().eq("id", taskIdV);
  if (error) throw dbError(error);

  if (existing?.course_id) await recomputeTopicStats(supabase, studentIdV, existing.course_id, existing.topic_id);

  revalidatePath(`/coach/students/${studentIdV}`);
}

// --- Student detail: YouTube smart link -----------------------------------

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"]);

// Fetches the official title of a pasted YouTube URL so the coach doesn't
// have to type it -- via YouTube's own oEmbed endpoint (the standard,
// purpose-built way to do this: www.youtube.com/oembed?url=...), not by
// scraping the watch page's HTML. The watch page is a heavily JS-rendered
// SPA -- a plain server-side fetch of it (no JS execution) often doesn't
// contain the real title in a <title> tag at all, or gets served a
// consent/interstitial page instead, which is exactly why titles were
// silently coming back empty and every video link fell back to the
// generic "Video" label. oEmbed always returns clean, already-decoded
// JSON regardless of any of that -- no HTML parsing needed at all.
//
// The host check runs before the call purely to reject obviously
// non-YouTube input early (and skip a wasted round-trip); it's not load-
// bearing for safety the way it would be for a raw fetch of an arbitrary
// URL, since the actual outbound request always goes to the fixed
// www.youtube.com host either way -- the pasted URL is just a query
// parameter YouTube's own service resolves, not a host our server fetches.
//
// Never throws -- every failure mode (bad URL, network error, malformed
// response, video without a title) resolves to null, matching the
// caller's "leave the title blank if we can't get one" expectation.
export async function fetchYoutubeTitle(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) {
      // TEMPORARY diagnostic (remove once title-fetching is confirmed
      // working in production) -- the request succeeding from a local
      // machine doesn't prove it succeeds from Vercel's own outbound IPs;
      // some public APIs rate-limit or block known datacenter ranges
      // differently than residential ones. This is the one piece of
      // evidence that distinguishes that from every other failure mode.
      const bodySnippet = await res.text().catch(() => "(could not read body)");
      console.error("[fetchYoutubeTitle] oEmbed request failed:", { url, status: res.status, statusText: res.statusText, bodySnippet: bodySnippet.slice(0, 500) });
      Sentry.captureMessage("fetchYoutubeTitle: oEmbed request failed", { extra: { url, status: res.status, statusText: res.statusText, bodySnippet: bodySnippet.slice(0, 500) } });
      return null;
    }
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null || !("title" in data) || typeof (data as { title: unknown }).title !== "string") {
      console.error("[fetchYoutubeTitle] oEmbed response had no usable title field:", { url, data });
      Sentry.captureMessage("fetchYoutubeTitle: oEmbed response missing title", { extra: { url, data } });
      return null;
    }
    const title = (data as { title: string }).title.trim();
    return title || null;
  } catch (e) {
    console.error("[fetchYoutubeTitle] unexpected error:", { url, error: e });
    Sentry.captureException(e, { extra: { url } });
    return null;
  }
}

// --- Student detail: Kaynak Takibi (coach write access) ------------------

const resourceKindSchema = z.enum(["study", "branch_exam"]);

export async function addStudentResource(studentId: string, courseId: string, name: string, kind: "study" | "branch_exam" = "study") {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const courseIdV = parseInput(z.string().trim().max(60), courseId);
  const nameV = parseInput(nonEmptyText(300, "Kaynak adı"), name);
  const kindV = parseInput(resourceKindSchema, kind);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  // A branch-trial resource created inline (from the task-assignment
  // resource picker's "type new" flow) starts with zero stock -- the
  // coach sets the real quantity afterward in Kaynak Takibi
  // (updateBranchExamStock below), keeping "create the resource" and
  // "stock it" as two deliberate steps.
  const { data, error } = await supabase
    .from("student_resources")
    .insert({
      student_id: studentIdV,
      course_id: courseIdV,
      name: nameV,
      kind: kindV,
      ...(kindV === "branch_exam" ? { total_stock: 0, remaining_stock: 0 } : {}),
    })
    .select("id, name")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
  return data as { id: string; name: string };
}

// Real stock-entry point for a branch-trial resource -- used from the
// Kaynak Takibi stock table, distinct from the quick-create inline path
// above (which always starts at 0).
export async function addBranchExamResource(
  studentId: string,
  courseId: string,
  name: string,
  totalStock: number,
  remainingStock: number,
) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const courseIdV = parseInput(z.string().trim().max(60), courseId);
  const nameV = parseInput(nonEmptyText(300, "Kaynak adı"), name);
  const totalStockV = parseInput(z.number().int().min(0), totalStock);
  const remainingStockV = parseInput(z.number().int().min(0), remainingStock);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_resources")
    .insert({
      student_id: studentIdV,
      course_id: courseIdV,
      name: nameV,
      kind: "branch_exam",
      total_stock: totalStockV,
      remaining_stock: remainingStockV,
    })
    .select("id, name, total_stock, remaining_stock")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
  return data as { id: string; name: string; total_stock: number; remaining_stock: number };
}

// A coach "restocking" (or correcting) a publisher's count later --
// applies the delta to remaining_stock too, rather than resetting it, so
// whatever's already been consumed isn't silently discarded.
export async function updateBranchExamStock(studentId: string, resourceId: string, newTotalStock: number) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const resourceIdV = parseInput(uuidSchema, resourceId);
  const newTotalStockV = parseInput(z.number().int().min(0), newTotalStock);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data: existing, error: fetchError } = await supabase
    .from("student_resources")
    .select("total_stock, remaining_stock")
    .eq("id", resourceIdV)
    .eq("student_id", studentIdV)
    .single();
  if (fetchError) throw dbError(fetchError);

  const delta = newTotalStockV - (existing.total_stock ?? 0);
  const nextRemaining = Math.max(0, (existing.remaining_stock ?? 0) + delta);

  const { data, error } = await supabase
    .from("student_resources")
    .update({ total_stock: newTotalStockV, remaining_stock: nextRemaining })
    .eq("id", resourceIdV)
    .select("id, name, total_stock, remaining_stock")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
  return data as { id: string; name: string; total_stock: number; remaining_stock: number };
}

const toggleProgressSchema = z.object({
  studentId: uuidSchema,
  courseId: z.string().trim().max(60),
  topicId: z.string().trim().max(60),
  resourceId: uuidSchema,
  solved: z.boolean(),
  reviewed: z.boolean(),
});

export async function toggleStudentResourceProgress(input: {
  studentId: string;
  courseId: string;
  topicId: string;
  resourceId: string;
  solved: boolean;
  reviewed: boolean;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(toggleProgressSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, inputV.studentId);

  const { error } = await supabase.from("student_resource_progress").upsert(
    {
      student_id: inputV.studentId,
      course_id: inputV.courseId,
      topic_id: inputV.topicId,
      resource_id: inputV.resourceId,
      solved: inputV.solved,
      reviewed: inputV.reviewed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,topic_id,resource_id" },
  );
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${inputV.studentId}`);
}

// Soft delete (Group 4a) -- hides the resource from the "add to a new
// task" combobox (ResourceCombobox filters to is_active) while every
// historical checkbox/stat tied to it stays exactly as it was. The
// reverse of reactivateStudentResource below.
export async function archiveStudentResource(studentId: string, resourceId: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const resourceIdV = parseInput(uuidSchema, resourceId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase
    .from("student_resources")
    .update({ is_active: false })
    .eq("id", resourceIdV)
    .eq("student_id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
}

export async function reactivateStudentResource(studentId: string, resourceId: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const resourceIdV = parseInput(uuidSchema, resourceId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase
    .from("student_resources")
    .update({ is_active: true })
    .eq("id", resourceIdV)
    .eq("student_id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
}

// Coach/admin-only: RLS enforces this (student_resources_coach_delete,
// migration 0014; student_resources_admin_all, migration 0040) -- the
// student's own RLS grants no delete at all (migration 0018), so a
// student calling this same table write from their own session is
// rejected by Postgres regardless of any UI-level restriction. Now also
// re-verified explicitly via requireCoachAccess (Security Hardening
// Group 4), on top of that RLS.
//
// True hard delete, unconditional: task_resources_resource_id_fkey and
// student_resource_progress_resource_id_fkey are both ON DELETE CASCADE
// (verified directly against pg_constraint), so this purges the resource
// and every task-link/progress row against it in one statement -- no
// separate cleanup needed, and nothing left orphaned. This used to check
// for existing student data first and refuse to delete if any was found
// ("archive instead") -- that guard is gone by explicit request: Kalıcı
// Sil is now always a real, unrestricted permanent delete. Archive
// (archiveStudentResource, above) is still there as the non-destructive
// alternative for a coach who wants to keep history.
export async function deleteStudentResource(studentId: string, resourceId: string) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const resourceIdV = parseInput(uuidSchema, resourceId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase.from("student_resources").delete().eq("id", resourceIdV).eq("student_id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
}

// --- Student detail: Kişisel & Akademik Profil edit (coach write access) ---

export type EditableProfileFields = {
  city: string | null;
  phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  target_university: string | null;
  target_department: string | null;
  target_ranking: string | null;
  school_name: string | null;
  sinif_sube: string | null;
  obp: number | null;
  attends_dershane: boolean;
  attends_deneme_kulubu: boolean;
  has_private_tutor: boolean;
  had_previous_coaching: boolean;
  previous_yks_ranking: string | null;
  favorite_subjects: string | null;
  difficult_subjects: string | null;
};

const editableProfileFieldsSchema = z.object({
  city: z.string().trim().max(120).nullable(),
  phone: z.string().trim().max(30).nullable(),
  parent_name: z.string().trim().max(120).nullable(),
  parent_phone: z.string().trim().max(30).nullable(),
  target_university: z.string().trim().max(200).nullable(),
  target_department: z.string().trim().max(200).nullable(),
  target_ranking: z.string().trim().max(60).nullable(),
  school_name: z.string().trim().max(200).nullable(),
  sinif_sube: z.string().trim().max(40).nullable(),
  obp: z.number().min(0).max(100).nullable(),
  attends_dershane: z.boolean(),
  attends_deneme_kulubu: z.boolean(),
  has_private_tutor: z.boolean(),
  had_previous_coaching: z.boolean(),
  previous_yks_ranking: z.string().trim().max(60).nullable(),
  favorite_subjects: z.string().trim().max(1000).nullable(),
  difficult_subjects: z.string().trim().max(1000).nullable(),
});

// coaching_start_date / assigned_meeting_day / remaining_sessions are
// deliberately NOT here -- they stay admin-only, enforced independently by
// prevent_student_system_field_tampering (migrations 0009/0012) regardless
// of the profiles_coach_update RLS policy (migration 0019) that lets this
// action through in the first place.
export async function updateStudentProfile(studentId: string, patch: EditableProfileFields) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const patchV = parseInput(editableProfileFieldsSchema, patch);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase.from("profiles").update(patchV).eq("id", studentIdV).select("*").single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
  return data;
}

// --- Student detail: daily stats override (optional, if the student forgot) ---

const overrideStatsSchema = z
  .object({
    entryDate: weekStartSchema,
    totalCount: z.number().int().min(0).max(10000),
    correctCount: z.number().int().min(0).max(10000),
    wrongCount: z.number().int().min(0).max(10000),
    emptyCount: z.number().int().min(0).max(10000),
  })
  .refine(
    (v) =>
      countsAreConsistent({ total: v.totalCount, correct: v.correctCount, wrong: v.wrongCount, empty: v.emptyCount }),
    { message: "Toplam, Doğru + Yanlış + Boş toplamına eşit olmalıdır.", path: ["totalCount"] },
  );

// Students' daily totals are auto-recomputed from their own tasks
// (submitDailyStats / recomputeDailyStats in app/student/actions.ts);
// this is the coach's manual override for when that organic total is
// wrong or incomplete for some reason (e.g. a task logged outside the
// app). Same table -- RLS (student_daily_stats_coach_override, 0031) is
// what actually restricts this to a coach's own assigned students.
// Unlike the student path, this REPLACES the row outright rather
// than resumming from student_tasks -- it's meant as a deliberate,
// explicit correction, not another automatic recompute.
export async function overrideStudentDailyStats(
  studentId: string,
  input: { entryDate: string; totalCount: number; correctCount: number; wrongCount: number; emptyCount: number },
) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const inputV = parseInput(overrideStatsSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_daily_stats")
    .upsert(
      {
        student_id: studentIdV,
        entry_date: inputV.entryDate,
        total_count: inputV.totalCount,
        correct_count: inputV.correctCount,
        wrong_count: inputV.wrongCount,
        empty_count: inputV.emptyCount,
      },
      { onConflict: "student_id,entry_date" },
    )
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
  return data;
}

// --- Trial (branş/genel deneme) result entry -----------------------------

// Coach-side mirror of getTaskTopicMistakes (app/student/actions.ts) --
// duplicated per this file's convention, RLS (student_task_topic_mistakes_coach_all)
// already scopes it to the coach's own roster either way.
export async function getTaskTopicMistakesForCoach(studentId: string, taskId: string) {
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_task_topic_mistakes")
    .select("course_id, topic_id, status")
    .eq("task_id", taskIdV);
  if (error) throw dbError(error);
  return data as { course_id: string; topic_id: string; status: "wrong" | "blank" }[];
}

const coachTrialMistakeSchema = z.object({
  courseId: z.string().trim().max(60),
  topicId: z.string().trim().max(60),
  status: z.enum(["wrong", "blank"]),
});

const saveCoachTrialResultsSchema = z
  .object({
    totalCount: z.number().int().min(0).max(10000).nullable(),
    correctCount: z.number().int().min(0).max(10000).nullable(),
    wrongCount: z.number().int().min(0).max(10000).nullable(),
    emptyCount: z.number().int().min(0).max(10000).nullable(),
    mistakes: z.array(coachTrialMistakeSchema),
  })
  .refine(
    (v) =>
      countsAreConsistent({ total: v.totalCount, correct: v.correctCount, wrong: v.wrongCount, empty: v.emptyCount }),
    { message: "Toplam, Doğru + Yanlış + Boş toplamına eşit olmalıdır.", path: ["totalCount"] },
  );

// Lets a coach record a branş/genel deneme's actual results on the
// student's behalf -- previously the only way results got recorded was
// the student's own task modal. Deliberately simpler than that modal's
// general_exam flow (no per-subject breakdown, one overall Doğru/Yanlış/
// Boş) -- a quick coach-side entry, not full parity. Mirrors
// saveTaskAnalysis's delete-then-reinsert for the topic-mistake set.
export async function saveCoachTrialResults(
  studentId: string,
  taskId: string,
  input: {
    totalCount: number | null;
    correctCount: number | null;
    wrongCount: number | null;
    emptyCount: number | null;
    mistakes: { courseId: string; topicId: string; status: "wrong" | "blank" }[];
  },
) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const taskIdV = parseInput(uuidSchema, taskId);
  const inputV = parseInput(saveCoachTrialResultsSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { data, error } = await supabase
    .from("student_tasks")
    .update({
      total_count: inputV.totalCount,
      correct_count: inputV.correctCount,
      wrong_count: inputV.wrongCount,
      empty_count: inputV.emptyCount,
      status: "done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskIdV)
    .select("*")
    .single();
  if (error) throw dbError(error);

  // Sets status: "done" directly above, which is exactly a countedness-
  // flipping write -- course_id is null for a Genel Deneme (no dedicated
  // column, see classifyTrack's own comment), so only Branş sonuçları
  // ever actually have a bucket to resync here.
  if (data.course_id) await recomputeTopicStats(supabase, studentIdV, data.course_id, data.topic_id);

  const { error: deleteError } = await supabase.from("student_task_topic_mistakes").delete().eq("task_id", taskIdV);
  if (deleteError) throw dbError(deleteError);

  if (inputV.mistakes.length > 0) {
    const { error: insertError } = await supabase
      .from("student_task_topic_mistakes")
      .insert(inputV.mistakes.map((m) => ({ task_id: taskIdV, course_id: m.courseId, topic_id: m.topicId, status: m.status })));
    if (insertError) throw dbError(insertError);
  }

  revalidatePath(`/coach/students/${studentIdV}`);
  revalidatePath(`/coach/students/${studentIdV}/schedule`);
  return data;
}

// --- Karne v2: cycle-based, archived, coach-approved report cards --------

// Regex-shape alone (\d{4}-\d{2}-\d{2}) would still accept a calendar-
// invalid string like "2026-13-40" -- isValidISODateOnly (lib/chart-
// range.ts) additionally round-trips it through local Date components,
// the same timezone-safe construction KarneRangePicker's own dateToISO
// uses client-side, so a range that passes here is guaranteed to be a
// real, unambiguous calendar day on both sides of the request.
const karneRangeDateSchema = z.string().refine(isValidISODateOnly, { message: "Geçersiz tarih." });

// Defaults to the NEXT sequential 4-week cycle for a student -- chains
// strictly off the last generated cycle (or the student's
// coaching_start_date for the very first one, falling back to the
// coach_students roster-link date the same way app/coach/stats/page.tsx
// already does, since coaching_start_date is so often never set). One
// button, one insert, mirrors createCoachNote's exact guard/insert/
// revalidate shape above.
//
// Flexible range (Warning Mode): the coach can override this default with
// their own range_start/range_end (karneler-tab.tsx's date range picker)
// -- e.g. a short intensive-camp period -- instead of always taking the
// auto-calculated 28-day block. approveReportCard no longer rejects a
// short range either; see that function's own comment.
export async function generateCycleReportCard(studentId: string, customRange?: { rangeStart: string; rangeEnd: string }) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const customRangeV = customRange
    ? {
        rangeStart: parseInput(karneRangeDateSchema, customRange.rangeStart),
        rangeEnd: parseInput(karneRangeDateSchema, customRange.rangeEnd),
      }
    : null;
  if (customRangeV && customRangeV.rangeStart > customRangeV.rangeEnd) {
    throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  }
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const [{ data: profile }, { data: link }, { data: lastCycle }, { data: openDraft }] = await Promise.all([
    supabase.from("profiles").select("coaching_start_date").eq("id", studentIdV).maybeSingle(),
    supabase.from("coach_students").select("created_at").eq("coach_id", user.id).eq("student_id", studentIdV).maybeSingle(),
    supabase
      .from("student_report_cards")
      .select("cycle_number, range_end, stats")
      .eq("student_id", studentIdV)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Explicit pre-insert check (Karne v2 duplicate-prevention hardening)
    // -- the "Yeni Dönem Karnesi Oluştur" button is already disabled
    // client-side while a draft is open, but that alone leaves a race
    // window (double-click, two tabs) where two concurrent calls could
    // both read the same "last cycle" and insert overlapping/duplicate
    // rows. The DB's UNIQUE(student_id, cycle_number) constraint would
    // still catch an exact collision, but only as a generic sanitized
    // error (dbError) -- this gives a clear, specific message instead.
    supabase.from("student_report_cards").select("id").eq("student_id", studentIdV).eq("status", "draft").maybeSingle(),
  ]);

  if (openDraft) throw new Error("Bu öğrenci için zaten bekleyen bir karne taslağı var.");

  let rangeStart: string;
  let rangeEnd: string;
  if (customRangeV) {
    ({ rangeStart, rangeEnd } = customRangeV);
  } else {
    const coachingStart = profile?.coaching_start_date ?? link?.created_at?.slice(0, 10);
    if (!coachingStart) throw new Error("Öğrencinin koçluk başlangıç tarihi belirlenemedi.");
    ({ rangeStart, rangeEnd } = nextCycleRange(coachingStart, lastCycle?.range_end ?? null));
  }
  const cycleNumber = (lastCycle?.cycle_number ?? 0) + 1;

  // Widened beyond branch_exam/general_exam to also pull question_bank/
  // topic_study rows, plus correct_count/wrong_count/empty_count --
  // computeAylikKarne and computeNetSummary both already filter internally
  // by task_type/title shape, so the extra rows are simply ignored by
  // them; only computeTytScoreBreakdown below actually reads the score
  // columns.
  // Soft coach approval: a student's own pending self-created entry
  // (is_coach_assigned: false, is_approved_by_coach: false) must not
  // reach the Karne until approveStudentTask (above) reviews it --
  // coach-assigned tasks are always pre-approved.
  const { data: examRows, error: examError } = await supabase
    .from("student_tasks")
    .select("id, task_date, task_type, course_id, title, subject_scores, correct_count, wrong_count, empty_count")
    .eq("student_id", studentIdV)
    .in("task_type", ["branch_exam", "general_exam", "question_bank", "topic_study"])
    .or("is_coach_assigned.eq.true,is_approved_by_coach.eq.true")
    .gte("task_date", rangeStart)
    .lte("task_date", rangeEnd);
  if (examError) throw dbError(examError);

  const exams = examRows ?? [];
  const examIds = exams.filter((e) => e.task_type === "branch_exam" || e.task_type === "general_exam").map((e) => e.id);
  const { data: mistakeRows, error: mistakeError } =
    examIds.length > 0
      ? await supabase.from("student_task_topic_mistakes").select("task_id, course_id, topic_id").in("task_id", examIds)
      : { data: [] as { task_id: string; course_id: string; topic_id: string }[], error: null };
  if (mistakeError) throw dbError(mistakeError);

  // Separate, broader query for Toplam Çalışma Süresi -- deliberately not
  // scoped to the 4 exam-shaped task_types examRows above is (video and
  // extra_custom carry duration_minutes too, and "how long did the
  // student study" shouldn't silently drop those). Same date range + soft
  // coach-approval filter as every other Karne metric, for the same
  // "only coach-vetted data counts toward the official report card" reason.
  const { data: durationRows, error: durationError } = await supabase
    .from("student_tasks")
    .select("duration_minutes")
    .eq("student_id", studentIdV)
    .or("is_coach_assigned.eq.true,is_approved_by_coach.eq.true")
    .gte("task_date", rangeStart)
    .lte("task_date", rangeEnd);
  if (durationError) throw dbError(durationError);

  const topicMistakes = computeAylikKarne(ALL_CURRICULUM_COURSE_IDS, exams, mistakeRows ?? [], rangeStart, rangeEnd);
  const currentNet = computeNetSummary(exams as KarneGeneralExam[], rangeStart, rangeEnd);
  // Same `exams` array serves both params below: the course_id-tagged
  // practice rows (question_bank/topic_study/branch_exam) and the
  // general_exam rows (course_id always null) are disjoint subsets of it,
  // so computeTytScoreBreakdown's own internal filtering picks each row
  // up exactly once, in whichever half actually applies to it.
  const scoreBreakdown = computeTytScoreBreakdown(exams, exams as KarneGeneralExam[], rangeStart, rangeEnd);
  const aytScoreBreakdown = computeAytScoreBreakdown(exams, exams as KarneGeneralExam[], rangeStart, rangeEnd);
  const totalDurationMinutes = computeTotalDurationMinutes(durationRows ?? []);
  const previousStats = lastCycle?.stats as NetSummary | undefined;
  const stats: NetSummary = {
    tyt: { current: currentNet.tyt, previous: previousStats?.tyt.current ?? null },
    ayt: { current: currentNet.ayt, previous: previousStats?.ayt.current ?? null },
    scoreBreakdown,
    aytScoreBreakdown,
    totalDurationMinutes,
  };

  const { data, error } = await supabase
    .from("student_report_cards")
    .insert({
      student_id: studentIdV,
      coach_id: user.id,
      cycle_number: cycleNumber,
      range_start: rangeStart,
      range_end: rangeEnd,
      status: "draft",
      stats,
      topic_mistakes: topicMistakes,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${studentIdV}`);
  return data;
}

const approveReportCardSchema = z.object({
  reportCardId: uuidSchema,
  coachNotes: z.string().trim().max(2000).optional(),
});

// Single combined action -- review, add a note, "Onayla ve Gönder" is one
// submit, not a separate draft-save step. Only this flips a report card
// visible to the student (student_report_cards_student_read RLS gates on
// status = 'approved').
//
// Duplicate-prevention guard on top of the original insert-and-flip
// logic: status is re-checked here (not just gated by the UI showing/
// hiding the "Onayla ve Gönder" button) so a double-click or a stale
// tab can't silently re-stamp approved_at/coach_notes on an already-
// published card.
//
// The 28-day minimum used to be a hard block here too. Product decision
// (Warning Mode): short cycles (intensive camps, short holidays) are
// legitimate and must stay approvable -- the coach only sees a yellow
// warning client-side (karneler-tab.tsx's ReportCardReview) now, this
// server action no longer rejects a short range.
export async function approveReportCard(reportCardId: string, coachNotes: string) {
  await assertNotImpersonating();
  const inputV = parseInput(approveReportCardSchema, { reportCardId, coachNotes });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_report_cards")
    .select("student_id, status")
    .eq("id", inputV.reportCardId)
    .single();
  if (fetchError) throw dbError(fetchError);
  await requireCoachAccess(supabase, user.id, existing.student_id);

  if (existing.status === "approved") throw new Error("Bu karne zaten onaylanmış.");

  const { data, error } = await supabase
    .from("student_report_cards")
    .update({
      status: "approved",
      coach_notes: inputV.coachNotes || null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inputV.reportCardId)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${existing.student_id}`);
  return data;
}

// Delete/revoke -- for a data-entry mistake discovered after the fact,
// on either a draft (just discard and regenerate) or an already-
// approved card (immediately un-publishes it: student_report_cards_
// student_read RLS gates on status = 'approved', so a deleted row is
// simply gone from the student's own view the next time it loads, no
// separate "unpublish" step needed). No RLS/grant change was needed for
// this -- student_report_cards_coach_all is already a FOR ALL policy,
// and the table's own migration already GRANTed delete.
//
// Deleting the most recent cycle also correctly re-opens its
// cycle_number for regeneration (generateCycleReportCard always computes
// cycleNumber from whatever the current last row is); deleting a middle
// cycle leaves a gap in the sequence, which is an accepted trade-off of
// keeping this a plain delete rather than a renumbering operation.
export async function deleteReportCard(reportCardId: string) {
  await assertNotImpersonating();
  const reportCardIdV = parseInput(uuidSchema, reportCardId);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_report_cards")
    .select("student_id")
    .eq("id", reportCardIdV)
    .single();
  if (fetchError) throw dbError(fetchError);
  await requireCoachAccess(supabase, user.id, existing.student_id);

  const { error } = await supabase.from("student_report_cards").delete().eq("id", reportCardIdV);
  if (error) throw dbError(error);

  revalidatePath(`/coach/students/${existing.student_id}`);
}

export type CoachReportCardRow = {
  id: string;
  cycle_number: number;
  range_start: string;
  range_end: string;
  status: "draft" | "approved";
  coach_notes: string | null;
  stats: NetSummary;
  topic_mistakes: KarneTopicRow[];
  generated_at: string;
  approved_at: string | null;
};

// --- Kronometre Yarışması (coach roster ranking) --------------------------

export type CompetitionStatus = "active" | "passive";

export type StopwatchRosterRow = {
  studentId: string;
  fullName: string | null;
  sinifSube: string | null;
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyMinutes: number;
  // "Anlık Çalışma Durumu" -- freshness is judged client-side via
  // isLiveNow (lib/focus-live-status.ts) against a ticking clock, not
  // baked into a boolean here, since this row is only refetched on a
  // month change while the raw timestamp needs to keep decaying between
  // those refetches -- see getCoachLiveFocusStatuses below for the cheap
  // poll that keeps it current in between.
  activeFocusHeartbeatAt: string | null;
  // Coach-only grouping + active/passive exclusion (0068_stopwatch_
  // competition_groups.sql) -- a passive student's minutes are still real
  // and shown here (the coach must always be able to see them), only
  // get_daily_stopwatch_ranking()'s STUDENT-facing ranking excludes them.
  competitionGroupId: string | null;
  competitionGroupName: string | null;
  competitionStatus: CompetitionStatus;
};

const stopwatchMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

// Today/this-week are always "now" regardless of which month is picked
// for the monthly column, so this fetches one window wide enough to
// cover both: from whichever is earlier, this week's Monday or the
// selected month's 1st, through today (a selected month can never have
// data past today). Sorted by monthlyMinutes descending, per the page's
// own default. Each row is one flat object per student so a later
// cross-coach "#1 platform-wide" indicator can be added to this same
// shape without restructuring -- not built now, just left as a clean
// seam (see StopwatchRosterRow above).
//
// Exported separately (taking the supabase client + coachId explicitly)
// so the initial page load -- app/coach/stopwatch/page.tsx, a Server
// Component -- can pass view.effectiveUserId directly. The "use server"
// action below (getStopwatchCompetitionData) resolves the REAL logged-in
// user via requireUser(), which during impersonation is the admin, not
// the coach being viewed; the month picker's own client-triggered
// refetches go through that action as normal, and are unreachable during
// impersonation anyway (the whole panel renders inside a disabled
// <fieldset> then) -- this split is purely for getting the initial
// render right.
export async function fetchStopwatchCompetitionRoster(
  supabase: SupabaseClient,
  coachId: string,
  year: number,
  month: number,
): Promise<StopwatchRosterRow[]> {
  const { year: yearV, month: monthV } = parseInput(stopwatchMonthSchema, { year, month });
  const { data: rosterLinks } = await supabase.from("coach_students").select("student_id").eq("coach_id", coachId);
  const studentIds = (rosterLinks ?? []).map((l) => l.student_id);
  if (studentIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = mondayOf(today);
  const monthStart = `${yearV}-${String(monthV).padStart(2, "0")}-01`;
  const nextMonth = monthV === 12 ? { y: yearV + 1, m: 1 } : { y: yearV, m: monthV + 1 };
  const monthEndExclusive = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`;
  const rangeStart = monthStart < weekStart ? monthStart : weekStart;

  // profiles has TWO relationships to student_groups -- student_groups.
  // coach_id (a coach's own groups) and profiles.competition_group_id
  // (which group THIS profile belongs to) -- so the embed needs the
  // !profiles_competition_group_id_fkey hint or PostgREST rejects it as
  // ambiguous (error PGRST201, verified directly against production).
  // That error was never being checked below, so the whole query silently
  // came back as `profiles: null` and every row's fullName fell back to
  // null -- the actual cause of every name in the Kronometre Yarışması
  // widget rendering as "—". Also added the missing error check itself,
  // so a future regression here fails loudly instead of silently again.
  const [{ data: profiles, error: profilesError }, { data: taskRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, sinif_sube, active_focus_heartbeat_at, competition_group_id, competition_status, student_groups!profiles_competition_group_id_fkey(name)",
      )
      .in("id", studentIds),
    supabase
      .from("student_tasks")
      .select("student_id, task_date, duration_minutes")
      .in("student_id", studentIds)
      .gte("task_date", rangeStart)
      .lte("task_date", today),
  ]);
  if (profilesError) throw dbError(profilesError);

  const totalsByStudent = new Map<string, { daily: number; weekly: number; monthly: number }>();
  for (const id of studentIds) totalsByStudent.set(id, { daily: 0, weekly: 0, monthly: 0 });

  for (const row of taskRows ?? []) {
    const totals = totalsByStudent.get(row.student_id);
    if (!totals) continue;
    const minutes = row.duration_minutes ?? 0;
    if (row.task_date === today) totals.daily += minutes;
    if (row.task_date >= weekStart) totals.weekly += minutes;
    if (row.task_date >= monthStart && row.task_date < monthEndExclusive) totals.monthly += minutes;
  }

  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p as typeof p & { student_groups: { name: string } | null; competition_status: CompetitionStatus },
    ]),
  );

  return studentIds
    .map((id) => {
      const totals = totalsByStudent.get(id)!;
      const profile = profileById.get(id);
      return {
        studentId: id,
        fullName: profile?.full_name ?? null,
        sinifSube: profile?.sinif_sube ?? null,
        dailyMinutes: totals.daily,
        weeklyMinutes: totals.weekly,
        monthlyMinutes: totals.monthly,
        activeFocusHeartbeatAt: profile?.active_focus_heartbeat_at ?? null,
        competitionGroupId: profile?.competition_group_id ?? null,
        competitionGroupName: profile?.student_groups?.name ?? null,
        competitionStatus: profile?.competition_status ?? "active",
      };
    })
    .sort((a, b) => b.monthlyMinutes - a.monthlyMinutes);
}

// The month picker's client-triggered entry point -- see
// fetchStopwatchCompetitionRoster's own comment for why the initial
// page-load path calls that helper directly (with effectiveUserId)
// instead of this action.
export async function getStopwatchCompetitionData(year: number, month: number): Promise<StopwatchRosterRow[]> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  return fetchStopwatchCompetitionRoster(supabase, user.id, year, month);
}

export type LiveFocusStatus = { studentId: string; activeFocusHeartbeatAt: string | null };

// Polled every ~20s by both the dashboard's stopwatch widget and the
// /coach/stopwatch table so "Çalışıyor"/"Boşta" stays current without
// re-running fetchStopwatchCompetitionRoster's heavier daily/weekly/
// monthly aggregation on the same cadence -- this only ever reads two
// small columns for the coach's own roster.
export async function getCoachLiveFocusStatuses(): Promise<LiveFocusStatus[]> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  // Single embedded query instead of roster-then-profiles as two separate
  // round trips -- coach_students has FKs to profiles on both coach_id and
  // student_id, so the relationship is ambiguous without the !student_id
  // hint (PostgREST error PGRST201 without it, verified directly).
  const { data, error } = await supabase
    .from("coach_students")
    .select("student_id, profiles!student_id(active_focus_heartbeat_at)")
    .eq("coach_id", user.id);
  if (error) throw dbError(error);

  // student_id is unique on coach_students, so this embed is genuinely
  // one-to-one -- verified directly against the real schema, a single
  // object per row, not an array. The untyped client still infers the
  // generic to-many array shape here since it has no generated types to
  // know that, hence the cast.
  const rows = (data ?? []) as unknown as { student_id: string; profiles: { active_focus_heartbeat_at: string | null } | null }[];
  return rows.map((row) => ({
    studentId: row.student_id,
    activeFocusHeartbeatAt: row.profiles?.active_focus_heartbeat_at ?? null,
  }));
}

// --- Kronometre Yarışması: coach-private groups + active/passive status ---
//
// A group (student_groups, 0068_stopwatch_competition_groups.sql) is a
// coach's own private label for splitting their roster into separate
// leaderboards -- visible only to that coach (the table has no
// student-read RLS policy at all). "Passive" excludes a student from
// get_daily_stopwatch_ranking()'s ranked pool entirely while they keep
// logging time and the coach keeps seeing it (StopwatchRosterRow above
// always carries a student's real minutes regardless of status).

export type StudentGroup = { id: string; name: string };

const groupNameSchema = nonEmptyText(80, "Grup adı");

// Split the same way fetchStopwatchCompetitionRoster is (see its own
// comment) -- app/coach/stopwatch/page.tsx's initial render needs
// view.effectiveUserId during impersonation, not requireUser()'s real
// admin id, while getStudentGroups (below) is the normal client-callable
// entry point.
export async function fetchStudentGroups(supabase: SupabaseClient, coachId: string): Promise<StudentGroup[]> {
  const { data, error } = await supabase.from("student_groups").select("id, name").eq("coach_id", coachId).order("name", { ascending: true });
  if (error) throw dbError(error);
  return data ?? [];
}

export async function getStudentGroups(): Promise<StudentGroup[]> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  return fetchStudentGroups(supabase, user.id);
}

export async function createStudentGroup(name: string): Promise<StudentGroup> {
  await assertNotImpersonating();
  const nameV = parseInput(groupNameSchema, name);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase.from("student_groups").insert({ coach_id: user.id, name: nameV }).select("id, name").single();
  if (error) throw dbError(error);

  revalidatePath("/coach/stopwatch");
  revalidatePath("/coach/dashboard");
  return data;
}

export async function renameStudentGroup(groupId: string, name: string): Promise<StudentGroup> {
  await assertNotImpersonating();
  const groupIdV = parseInput(uuidSchema, groupId);
  const nameV = parseInput(groupNameSchema, name);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("student_groups")
    .update({ name: nameV })
    .eq("id", groupIdV)
    .eq("coach_id", user.id)
    .select("id, name")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/coach/stopwatch");
  revalidatePath("/coach/dashboard");
  return data;
}

// Any student pointing at this group falls back to competition_group_id =
// null automatically (the FK is ON DELETE SET NULL) -- no separate
// profiles update needed here.
export async function deleteStudentGroup(groupId: string) {
  await assertNotImpersonating();
  const groupIdV = parseInput(uuidSchema, groupId);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { error } = await supabase.from("student_groups").delete().eq("id", groupIdV).eq("coach_id", user.id);
  if (error) throw dbError(error);

  revalidatePath("/coach/stopwatch");
  revalidatePath("/coach/dashboard");
}

// null clears a student's group assignment (back to the shared
// "ungrouped" pool -- see get_daily_stopwatch_ranking's null-safe
// comparison). groupId, when given, must belong to this coach; the
// profiles_coach_update RLS check alone wouldn't catch a coach pointing a
// student at ANOTHER coach's group id, so that's verified explicitly here,
// same double-layer-authorization spirit as requireCoachAccess itself.
export async function setStudentCompetitionGroup(studentId: string, groupId: string | null) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const groupIdV = groupId === null ? null : parseInput(uuidSchema, groupId);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  if (groupIdV !== null) {
    const { data: group } = await supabase.from("student_groups").select("id").eq("id", groupIdV).eq("coach_id", user.id).maybeSingle();
    if (!group) throw new Error("Bu grup sana ait değil.");
  }

  const { error } = await supabase.from("profiles").update({ competition_group_id: groupIdV }).eq("id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath("/coach/stopwatch");
  revalidatePath("/coach/dashboard");
}

const competitionStatusSchema = z.enum(["active", "passive"]);

export async function setStudentCompetitionStatus(studentId: string, status: CompetitionStatus) {
  await assertNotImpersonating();
  const studentIdV = parseInput(uuidSchema, studentId);
  const statusV = parseInput(competitionStatusSchema, status);
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireCoachAccess(supabase, user.id, studentIdV);

  const { error } = await supabase.from("profiles").update({ competition_status: statusV }).eq("id", studentIdV);
  if (error) throw dbError(error);

  revalidatePath("/coach/stopwatch");
  revalidatePath("/coach/dashboard");
}
