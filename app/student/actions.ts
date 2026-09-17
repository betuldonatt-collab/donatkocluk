"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { computeAutoTaskStatus, countsAreConsistent, mergeDualTaskStatus, type DualPartStatus } from "@/lib/count-fields";
import { dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { mondayOf } from "@/lib/date";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import { EXAMS_PAGE_SIZE } from "./constants";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return user;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih.");

export type TaskProgressPatch = Partial<{
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
  subject_scores: Record<string, { correct: number | null; wrong: number | null; empty: number | null }> | null;
  completed: boolean;
  analysis_pending: boolean;
  status: "pending" | "done" | "half_done" | "not_done";
  reason: string | null;
  note: string | null;
}>;

const SCORE_FIELDS = ["total_count", "correct_count", "wrong_count", "empty_count"] as const;

// Recomputes one (student, course, topic) bucket in student_topic_stats
// (migration 0072) from scratch -- called after any write that could
// change a task's contribution to it. Mirrors recomputeDailyStats' own
// call-site-driven, self-healing idiom, one level up. A null courseId
// (e.g. a task with no curriculum course attached) has no bucket to
// recompute -- every call site below checks for that before calling this.
async function recomputeTopicStats(supabase: SupabaseClient, studentId: string, courseId: string, topicId: string | null) {
  const { error } = await supabase.rpc("recompute_student_topic_stats", {
    p_student_id: studentId,
    p_course_id: courseId,
    p_topic_id: topicId ?? "karma",
  });
  if (error) throw dbError(error);
}

const countField = z.number().int().min(0).max(10000).nullable().optional();
const subjectScoreSchema = z.object({
  correct: z.number().int().min(0).max(10000).nullable(),
  wrong: z.number().int().min(0).max(10000).nullable(),
  empty: z.number().int().min(0).max(10000).nullable(),
});
// No countsAreConsistent refine here (unlike createRichCustomTaskSchema
// below, a one-shot "declare a finished result" flow where exact
// consistency still makes sense) -- this is the ongoing-progress path,
// where Doğru+Yanlış+Boş falling short of Toplam is now a legitimate,
// expected state ("Yarım Yapıldı"), not a data-entry error to reject. See
// computeAutoTaskStatus below.
const taskProgressPatchSchema = z.object({
  total_count: countField,
  correct_count: countField,
  wrong_count: countField,
  empty_count: countField,
  duration_minutes: z.number().int().min(0).max(1440).nullable().optional(),
  subject_scores: z.record(z.string(), subjectScoreSchema).nullable().optional(),
  completed: z.boolean().optional(),
  analysis_pending: z.boolean().optional(),
  status: z.enum(["pending", "done", "half_done", "not_done"]).optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

// Security Hardening Group 4 (double-layer authorization): student_tasks
// RLS (student_tasks_student_update) already restricts this update to
// student_id = auth.uid() -- but relying on that alone means a
// cross-account attempt would previously surface here as a confusing
// ".single()" crash (RLS filters the UPDATE to 0 matched rows, then
// .select().single() throws on "no rows returned"), not a clear rejection.
// Fetching the task's real owner first and comparing explicitly turns
// that into an intentional, immediate "not yours" error instead.
export async function updateTaskProgress(taskId: string, patch: TaskProgressPatch) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const patchV = parseInput(taskProgressPatchSchema, patch);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select("student_id, is_coach_assigned, task_type, total_count, correct_count, wrong_count, empty_count")
    .eq("id", taskIdV)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  // Coach-assigned Toplam is the coach's own call -- the student only
  // ever changes how many they actually solved (Doğru/Yanlış/Boş). The UI
  // never renders an editable field for this case, but this is the
  // authoritative check (mirrored at the DB level by
  // prevent_student_task_core_tampering, migration 0077) -- a direct or
  // forged call gets the same clear rejection.
  if (existing.is_coach_assigned && "total_count" in patchV && patchV.total_count !== existing.total_count) {
    throw new Error("Koç tarafından atanan toplam soru sayısı değiştirilemez.");
  }

  // A "dual" task (task-modal.tsx) is a video/topic-study task that also
  // carries a real question-count target -- the student logs BOTH a
  // manual status for the video/topic-study half AND question counts for
  // the other half, and the two get merged (mergeDualTaskStatus) into one
  // overall status. A question_bank/branch_exam/reading task with NO count
  // target at all (a duration-only or page-count-only target, e.g. "Soru
  // Çözümü · 60 dk" or a page-target-less Kitap Okuma) needs the same
  // explicit declaration for the opposite reason: computeAutoTaskStatus
  // below can never derive a status from counts without a numeric target to
  // compare against, and per product decision such a task must never
  // auto-complete -- the student declares its status themselves instead.
  // Either way the manual pick is required -- the UI already blocks Kaydet
  // without it, but this is the authoritative gate.
  const dualTarget = "total_count" in patchV ? (patchV.total_count ?? null) : existing.total_count;
  const isDual = (existing.task_type === "video" || existing.task_type === "topic_study") && dualTarget !== null;
  const isDurationOnlyTarget =
    (existing.task_type === "question_bank" || existing.task_type === "branch_exam" || existing.task_type === "reading") &&
    dualTarget === null;
  const needsManualStatus = isDual || isDurationOnlyTarget;
  let dualManualStatus: DualPartStatus | null = null;
  if (needsManualStatus) {
    if (patchV.status === undefined || patchV.status === "pending") {
      throw new Error("Görev durumu seçilmeden kaydedilemez.");
    }
    dualManualStatus = patchV.status;
  }

  // Auto status: whenever this update touches how many were actually
  // solved, and the task has a known Toplam (coach- or self-assigned) to
  // compare against, the resulting status is computed here -- never
  // trusted from the client -- rather than the caller having to get this
  // right itself. Mirrors the live hint shown in task-modal.tsx exactly
  // (computeAutoTaskStatus, lib/count-fields.ts), so what the student sees
  // before saving always matches what's actually persisted. A dual task
  // merges this count-based result with the manual half above instead of
  // being overwritten by it outright. An explicit status the caller passed
  // with no counts touched (a single-part task's status button, or a dual
  // task's manual pick with the counts left untouched this save) is left
  // as-is either way.
  const touchesCounts = "correct_count" in patchV || "wrong_count" in patchV || "empty_count" in patchV;
  if (touchesCounts) {
    const correct = ("correct_count" in patchV ? patchV.correct_count : existing.correct_count) ?? 0;
    const wrong = ("wrong_count" in patchV ? patchV.wrong_count : existing.wrong_count) ?? 0;
    const empty = ("empty_count" in patchV ? patchV.empty_count : existing.empty_count) ?? 0;
    const countStatus = computeAutoTaskStatus(dualTarget, correct, wrong, empty);
    if (countStatus) {
      patchV.status = dualManualStatus ? mergeDualTaskStatus(dualManualStatus, countStatus) : countStatus;
    }
  }

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ ...patchV, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();

  if (error) throw dbError(error);

  // Any task carrying a score (question_bank, branch_exam, ...) folds
  // straight into that day's student_daily_stats -- there's no separate
  // "log your grand total" step for the student to keep in sync by hand.
  if (SCORE_FIELDS.some((f) => f in patchV)) {
    await recomputeDailyStats(supabase, data.student_id, data.task_date);
  }
  // Counts AND status both affect this task's contribution to its topic
  // bucket (student_topic_stats, migration 0072) -- a status flip alone
  // (e.g. done -> not_done, with the same old counts still on the row)
  // must resync it just as much as a count edit does.
  if (data.course_id && (SCORE_FIELDS.some((f) => f in patchV) || "status" in patchV)) {
    await recomputeTopicStats(supabase, data.student_id, data.course_id, data.topic_id);
  }

  revalidatePath("/student");
  return data;
}

const setVideoLinkWatchedSchema = z.object({
  taskId: uuidSchema,
  url: z.string().trim().min(1).max(2000),
  watched: z.boolean(),
});

// Toggles ONE entry inside a task's video_links jsonb array by url (its
// natural key -- links don't carry a separate id) rather than by array
// index, since an index can silently point at the wrong entry if the
// array was ever reordered between page load and this click. Same
// double-layer ownership check as updateTaskProgress above. Doesn't touch
// total_count/status/course_id/topic_id, so unlike updateTaskProgress
// this never needs a student_daily_stats or student_topic_stats
// recompute -- watched is purely descriptive metadata on the link itself.
//
// Known limitation, not addressed here: a coach re-saving this task's
// video links via updateAssignedTask (app/coach/actions.ts) replaces the
// whole video_links array from their own form, which doesn't carry a
// watched flag -- any watched state a student had already set would be
// lost if a coach edits the same task's links afterward.
export async function setVideoLinkWatched(taskId: string, url: string, watched: boolean) {
  await assertNotImpersonating();
  const v = parseInput(setVideoLinkWatchedSchema, { taskId, url, watched });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select("student_id, video_links")
    .eq("id", v.taskId)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  const links = (existing.video_links ?? []) as { url: string; title: string | null; watched?: boolean }[];
  if (!links.some((link) => link.url === v.url)) {
    throw new Error("Video linki bulunamadı.");
  }
  const updatedLinks = links.map((link) => (link.url === v.url ? { ...link, watched: v.watched } : link));

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ video_links: updatedLinks, updated_at: new Date().toISOString() })
    .eq("id", v.taskId)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

const orderListSchema = z.array(z.object({ id: uuidSchema, order_index: z.number().int().min(0) }));

// Persists a drag-and-drop reorder within one day's task list. Runs as
// parallel per-row updates rather than a single query -- day lists are
// short (a handful of tasks), and Supabase's client has no multi-row
// "update different values per row" primitive short of an upsert (which
// would require sending every NOT NULL column, not just order_index).
// RLS (student_tasks_student_update) already scopes each individual
// update to the caller's own rows -- an id belonging to someone else
// just fails silently here (0 rows touched), which is fine for a
// best-effort reorder with no single-row response to crash on, unlike
// updateTaskProgress above.
export async function updateTaskOrder(orders: { id: string; order_index: number }[]) {
  await assertNotImpersonating();
  const ordersV = parseInput(orderListSchema, orders);
  const supabase = await createClient();
  const results = await Promise.all(
    ordersV.map(({ id, order_index }) =>
      supabase.from("student_tasks").update({ order_index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw dbError(failed.error);

  revalidatePath("/student");
}

export async function deleteCustomTask(taskId: string) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  // Fetched before the delete -- need student_id/task_date to resync
  // that day's stats afterward, and the row won't exist to read anymore
  // once it's gone. Doubles as the double-layer ownership check (Security
  // Hardening Group 4): student_tasks_student_delete_custom already
  // restricts this to the caller's own, not-coach-assigned rows, but
  // rejecting explicitly here means "not yours" instead of a silent no-op.
  const { data: existing } = await supabase
    .from("student_tasks")
    .select("student_id, task_date, total_count, course_id, topic_id")
    .eq("id", taskIdV)
    .maybeSingle();
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  const { error } = await supabase.from("student_tasks").delete().eq("id", taskIdV);
  if (error) throw dbError(error);

  if (existing.total_count !== null) {
    await recomputeDailyStats(supabase, existing.student_id, existing.task_date);
  }
  if (existing.course_id) {
    await recomputeTopicStats(supabase, existing.student_id, existing.course_id, existing.topic_id);
  }

  revalidatePath("/student");
}

const ratingSchema = z.object({
  sessionId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).nullable(),
});

export async function submitSessionRating(sessionId: string, rating: number, feedback: string | null) {
  await assertNotImpersonating();
  const inputV = parseInput(ratingSchema, { sessionId, rating, feedback });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: session } = await supabase
    .from("coaching_sessions")
    .select("student_id")
    .eq("id", inputV.sessionId)
    .maybeSingle();
  if (!session || session.student_id !== user.id) {
    throw new Error("Bu görüşme sana ait değil.");
  }

  const { data, error } = await supabase
    .from("coaching_sessions")
    .update({
      student_rating: inputV.rating,
      student_feedback: inputV.feedback,
      rated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inputV.sessionId)
    .select("*")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

// "Daha Fazla Yükle" on Deneme Analizleri (branş & genel) -- both pages'
// initial server fetch only loads the most recent EXAMS_PAGE_SIZE exams of
// that type. Shared helper since branş/genel differ only in task_type.
async function getMoreExams(taskType: "branch_exam" | "general_exam", offset: number) {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: examRows, error } = await supabase
    .from("student_tasks")
    .select("*")
    .eq("student_id", user.id)
    .eq("task_type", taskType)
    .order("task_date", { ascending: false })
    .range(offset, offset + EXAMS_PAGE_SIZE - 1);
  if (error) throw dbError(error);

  const exams = examRows ?? [];
  const examIds = exams.map((e) => e.id);
  const { data: mistakeRows } =
    examIds.length > 0
      ? await supabase.from("student_task_topic_mistakes").select("task_id, course_id, topic_id").in("task_id", examIds)
      : { data: [] };

  return { exams, mistakes: mistakeRows ?? [] };
}

export async function getMoreBransExams(offset: number) {
  return getMoreExams("branch_exam", offset);
}

export async function getMoreGenelExams(offset: number) {
  return getMoreExams("general_exam", offset);
}

export async function getTaskTopicMistakes(taskId: string) {
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_task_topic_mistakes")
    .select("course_id, topic_id, status")
    .eq("task_id", taskIdV);

  if (error) throw dbError(error);
  return data as { course_id: string; topic_id: string; status: "wrong" | "blank" }[];
}

const mistakeSchema = z.object({
  course_id: z.string().trim().max(60),
  topic_id: z.string().trim().max(60),
  status: z.enum(["wrong", "blank"]),
});

// Replaces the full mistake-topic set for a task and resolves its
// analysis: `deferred` persists the counts only ("Analizi Sonra Yap"),
// leaving analysis_pending true and skipping the topic list entirely.
export async function saveTaskAnalysis(
  taskId: string,
  mistakes: { course_id: string; topic_id: string; status: "wrong" | "blank" }[],
  deferred: boolean,
) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const mistakesV = parseInput(z.array(mistakeSchema), mistakes);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing } = await supabase
    .from("student_tasks")
    .select("student_id")
    .eq("id", taskIdV)
    .maybeSingle();
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  if (!deferred) {
    const { error: deleteError } = await supabase
      .from("student_task_topic_mistakes")
      .delete()
      .eq("task_id", taskIdV);
    if (deleteError) throw dbError(deleteError);

    if (mistakesV.length > 0) {
      const { error: insertError } = await supabase
        .from("student_task_topic_mistakes")
        .insert(mistakesV.map((m) => ({ task_id: taskIdV, course_id: m.course_id, topic_id: m.topic_id, status: m.status })));
      if (insertError) throw dbError(insertError);
    }
  }

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ analysis_pending: deferred, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

// --- Daily stats ("Günlük İstatistiklerim") -------------------------------

// Deliberately NOT a manual "type your grand total for the day" form --
// that was the original 0031 design, and it fought with the organic
// per-task numbers constantly (a student's typed total would drift from
// reality the moment they logged one more question bank result, and
// nothing reconciled the two). Instead this is a full resync: sum every
// one of the student's tasks for entry_date that actually carries a
// score, and overwrite the day's row with that sum. Recomputing from
// source beats incrementing -- an edit or delete on any task is reflected
// correctly for free, with no risk of double-counting or drift.
// Security audit hardening: this used to be a fetch-every-task-then-JS-
// sum-then-upsert round trip, relying on student_daily_stats_own being a
// FOR ALL RLS policy so this same anon-key client could write the
// result -- but that same policy let a student write ANY total directly
// via the Supabase client too, with zero validation, completely
// bypassing every Zod/countsAreConsistent guard built for student_tasks.
// Migration 0057 replaced that policy with SELECT-only and moved the
// aggregation into recompute_student_daily_stats(), a security definer
// RPC that resolves auth.uid() internally (never a caller-supplied id)
// and does the sum + upsert as one atomic SQL statement -- a student can
// now only ever trigger a trusted recompute from their own real task
// data, never supply the numbers themselves. `studentId` is kept as a
// parameter here purely so every call site still reads as "whose day is
// this," but the RPC itself ignores it and always resolves the caller.
async function recomputeDailyStats(
  supabase: SupabaseClient,
  studentId: string,
  entryDate: string,
) {
  void studentId;
  const { data, error } = await supabase.rpc("recompute_student_daily_stats", { p_entry_date: entryDate }).single();
  if (error) throw dbError(error);
  return data;
}

// Public entry point for the student's own resync (e.g. after deleting a
// custom task, where updateTaskProgress's own auto-recompute never runs).
export async function submitDailyStats(entryDate: string) {
  await assertNotImpersonating();
  const entryDateV = parseInput(dateSchema, entryDate);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const data = await recomputeDailyStats(supabase, user.id, entryDateV);
  revalidatePath("/student");
  return data;
}

// --- Week navigation ("Bu Hafta" history) ---------------------------------

// Lets the student's own "Bu Hafta" grid load ANY week, not just the
// current one -- RLS never actually blocked reading a past week
// (student_tasks_student_select has no date restriction, only the write
// policies do), the task board simply had no UI to ask for one. A locked
// week is exactly where this matters most: without it, a student loses
// all visibility into a program the moment their coach finalizes it.
export async function getTasksForWeek(weekStart: string, weekEnd: string) {
  const weekStartV = parseInput(dateSchema, weekStart);
  const weekEndV = parseInput(dateSchema, weekEnd);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const [{ data: taskRows, error }, { data: lockRow }, { data: taskResourceRows }] = await Promise.all([
    supabase
      .from("student_tasks")
      .select("*")
      .eq("student_id", user.id)
      .gte("task_date", weekStartV)
      .lte("task_date", weekEndV)
      .order("created_at", { ascending: true }),
    supabase.from("week_locks").select("id").eq("student_id", user.id).eq("week_start_date", weekStartV).maybeSingle(),
    // Mirrors fetchHomeData's own task_resources join (app/student/page.tsx)
    // exactly -- this is the OTHER path a task can reach the client
    // through (navigating "Bu Hafta" to a different week), so it needs
    // the same resource_names or a student would see kaynak names vanish
    // the moment they page away from the week they logged in on.
    supabase
      .from("task_resources")
      .select("task_id, order_index, student_tasks!inner(student_id), student_resources(name)")
      .eq("student_tasks.student_id", user.id)
      .gte("student_tasks.task_date", weekStartV)
      .lte("student_tasks.task_date", weekEndV)
      .order("order_index", { ascending: true }),
  ]);
  if (error) throw dbError(error);

  const resourceNamesByTask = new Map<string, string[]>();
  for (const row of taskResourceRows ?? []) {
    const name = (row as unknown as { student_resources: { name: string } | null }).student_resources?.name;
    if (!name) continue;
    const list = resourceNamesByTask.get(row.task_id) ?? [];
    list.push(name);
    resourceNamesByTask.set(row.task_id, list);
  }

  const weekLocked = lockRow !== null;
  return {
    tasks: (taskRows ?? []).map((t) => ({
      ...t,
      week_locked: weekLocked,
      resource_names: resourceNamesByTask.get(t.id) ?? [],
    })),
    weekLocked,
  };
}

// --- Announcements (RSVP) --------------------------------------------------

const rsvpSchema = z.object({
  announcementId: uuidSchema,
  response: z.enum(["attending", "not_attending"]),
  declineReason: z.string().trim().max(2000).nullable(),
});

// Upsert scoped to student_id = user.id -- matches the coach-notifications
// precedent (assertNotImpersonating + an explicit owner-id filter) rather
// than a requireXAccess helper, since this is a direct-ownership write with
// no cross-role relationship to check. announcement_rsvps' own check
// constraint (a decline needs a non-empty reason) is the DB-level backstop
// behind the client-side "required textarea" validation.
export async function submitAnnouncementRsvp(
  announcementId: string,
  response: "attending" | "not_attending",
  declineReason: string | null,
) {
  await assertNotImpersonating();
  const inputV = parseInput(rsvpSchema, { announcementId, response, declineReason });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("announcement_rsvps")
    .upsert(
      {
        announcement_id: inputV.announcementId,
        student_id: user.id,
        response: inputV.response,
        decline_reason: inputV.response === "not_attending" ? inputV.declineReason : null,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,student_id" },
    )
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

// Powers the "Geçmiş Programlar" dropdown -- every past week (within the
// last 12 months) that has at least one task, newest first. Mirrors the
// coach's own getPastWeeksForStudent (app/coach/actions.ts) exactly,
// including this same rolling window -- older weeks still exist in the
// DB, they just drop out of this specific dropdown, so this table never
// grows into an all-time scan as task history accumulates over years.
function isoDateMonthsAgo(months: number) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function getPastWeeksForStudent(): Promise<{ weekStart: string; taskCount: number }[]> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("student_tasks")
    .select("task_date")
    .eq("student_id", user.id)
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

export type DailyStopwatchRanking = {
  myRank: number | null;
  myTotalMinutes: number | null;
  topStudentName: string | null;
  topStudentTotalMinutes: number | null;
  participantCount: number;
  // The single highest scorer on the previous logical day (02:00 Turkey
  // time to 01:59:59 the next day, migration 0079) -- null when nobody in
  // the roster tracked any time that day, not just when there's no coach.
  yesterdayWinnerName: string | null;
  yesterdayWinnerTotalMinutes: number | null;
};

// Kronometre Yarışması widget -- calls the get_daily_stopwatch_ranking()
// security-definer function (migration 0054, extended in 0079 for the
// yesterday_winner_* columns) rather than querying student_tasks/profiles
// directly, since RLS has no student-to-student read policy at all. The
// function itself resolves the caller's own coach and returns only these
// scalars (never a per-student list), so there's nothing further to
// restrict here -- a student with no coach gets participantCount: 0 and
// every other field null, not an error.
export async function getDailyStopwatchRanking(): Promise<DailyStopwatchRanking> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { data, error } = await supabase.rpc("get_daily_stopwatch_ranking").single();
  if (error) throw dbError(error);

  const row = data as {
    my_rank: number | null;
    my_total_minutes: number | null;
    top_student_name: string | null;
    top_student_total_minutes: number | null;
    participant_count: number;
    yesterday_winner_name: string | null;
    yesterday_winner_total_minutes: number | null;
  };

  return {
    myRank: row.my_rank,
    myTotalMinutes: row.my_total_minutes,
    topStudentName: row.top_student_name,
    topStudentTotalMinutes: row.top_student_total_minutes,
    participantCount: row.participant_count,
    yesterdayWinnerName: row.yesterday_winner_name,
    yesterdayWinnerTotalMinutes: row.yesterday_winner_total_minutes,
  };
}

// "Anlık Çalışma Durumu" -- called every ~20s by FocusTimerModal while a
// session is actually running (see the onHeartbeat effect there), and
// once immediately on start/resume. Deliberately just a timestamp touch,
// not a toast-worthy action -- the caller swallows any failure, since a
// missed beat only means a coach sees a stale "Boşta" a little longer
// (see LIVE_STATUS_STALE_MS in lib/focus-live-status.ts), never a lost
// task update the way updateTaskProgress's own writes would be.
export async function sendFocusHeartbeat(): Promise<void> {
  const supabase = await createClient();
  await assertNotImpersonating();
  const user = await requireUser(supabase);
  await supabase.from("profiles").update({ active_focus_heartbeat_at: new Date().toISOString() }).eq("id", user.id);
}

// --- "Ek Çalışma Ekle" (rich self-logged task) --------------------------
//
// The old "Ekstra Çalışma Ekle" dialog only ever wrote a bare title/
// description with task_type "extra_custom" -- no course_id/topic_id, so
// a student's own practice could never show up in Kaynak Takibi or
// Gelişim Haritası the way a coach-assigned task does. This writes the
// exact same student_tasks columns a coach assignment does (see
// buildTaskRows in app/coach/actions.ts), with is_coach_assigned: false
// so it stays student-editable/deletable like any other self-added row
// (student_tasks_student_insert_custom/_delete_custom already allow any
// task_type/course_id/topic_id here -- no RLS change was needed for the
// student_tasks row itself, only for linking a resource to it, see
// migration 0056).
//
// Deliberately scoped narrower than the coach's own "Yeni Görev Ekle"
// form in two ways:
// - Course pickers only ever offer atomic TYT/AYT courses (never the
//   branch-exam macro groupings or Paragraf/Problem's routine pseudo-
//   courses) -- Kaynak Takibi's own tabs are atomic-only, so a task filed
//   under a macro course would silently be invisible there, and
//   Paragraf/Problem already has its own dedicated logging page.
// - Only "Soru Çözümü" gets full one-step result entry (Toplam/Doğru/
//   Yanlış/Boş) here, since that's the actual "I just did this, here's
//   what happened" case this feature is for. "Branş Denemesi"/"Genel
//   Deneme" are created pending, same as a coach assignment, and
//   completed afterward through the existing TaskModal (which already
//   has the full trial-results/subject-scores flow for those two types)
//   -- avoids re-building that considerably more complex UI a second
//   time here.
export type RichTaskType = "question_bank" | "topic_study" | "branch_exam" | "general_exam" | "extra_custom" | "reading";

const richTaskCountField = z.number().int().min(0).max(10000).nullable().optional();

const createRichCustomTaskSchema = z
  .object({
    taskDate: dateSchema,
    taskType: z.enum(["question_bank", "topic_study", "branch_exam", "general_exam", "extra_custom", "reading"]),
    courseId: z.string().trim().max(60).nullable().optional(),
    topicId: z.string().trim().max(60).nullable().optional(),
    resourceIds: z.array(uuidSchema).optional(),
    totalCount: richTaskCountField,
    correctCount: richTaskCountField,
    wrongCount: richTaskCountField,
    emptyCount: richTaskCountField,
    durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    generalExamTrack: z.enum(["tyt", "ayt"]).nullable().optional(),
    generalExamPublisher: z.string().trim().max(200).nullable().optional(),
    branchExamPublisher: z.string().trim().max(200).nullable().optional(),
    freeTitle: z.string().trim().max(200).nullable().optional(),
    freeDescription: z.string().trim().max(2000).nullable().optional(),
    bookTitle: z.string().trim().max(300).nullable().optional(),
  })
  .refine(
    (v) =>
      v.taskType !== "question_bank" ||
      countsAreConsistent({ total: v.totalCount ?? null, correct: v.correctCount ?? null, wrong: v.wrongCount ?? null, empty: v.emptyCount ?? null }),
    { message: "Toplam, Doğru + Yanlış + Boş toplamına eşit olmalıdır.", path: ["totalCount"] },
  )
  .refine((v) => v.taskType !== "extra_custom" || !!v.freeTitle?.trim(), { message: "Başlık zorunludur.", path: ["freeTitle"] });

export type CreateRichTaskInput = {
  taskDate: string;
  taskType: RichTaskType;
  courseId?: string | null;
  topicId?: string | null;
  resourceIds?: string[];
  totalCount?: number | null;
  correctCount?: number | null;
  wrongCount?: number | null;
  emptyCount?: number | null;
  durationMinutes?: number | null;
  generalExamTrack?: "tyt" | "ayt" | null;
  generalExamPublisher?: string | null;
  branchExamPublisher?: string | null;
  freeTitle?: string | null;
  freeDescription?: string | null;
  // "Kitap Okuma" only -- the book's name IS the title, same "lives only
  // on the row, no course/topic" shape as freeTitle above.
  bookTitle?: string | null;
};

// Mirrors buildTaskTitle/buildGeneralExamTitle/buildBranchExamTitle in
// app/coach/actions.ts (private there, so duplicated rather than
// cross-imported per this repo's panel convention) -- same title shape
// either side produces, so a self-logged and a coach-assigned task for
// the same course/topic read identically everywhere titles are shown.
function buildRichTaskTitle(v: z.infer<typeof createRichCustomTaskSchema>): string {
  if (v.taskType === "extra_custom") return v.freeTitle?.trim() || "Ekstra Çalışma";
  if (v.taskType === "reading") return v.bookTitle?.trim() || "Kitap Okuma";

  if (v.taskType === "general_exam") {
    const prefix = v.generalExamTrack === "ayt" ? "AYT" : "TYT";
    const pub = v.generalExamPublisher?.trim();
    return pub ? `${prefix} Genel Deneme - ${pub}` : `${prefix} Genel Deneme`;
  }

  const course = findCourseById(v.courseId);
  const prefix = v.courseId?.startsWith("tyt-") ? "TYT " : v.courseId?.startsWith("ayt-") ? "AYT " : "";
  const topic = v.taskType === "branch_exam" ? null : findTopicById(v.courseId, v.topicId);
  const base = !course ? "Görev" : topic ? `${prefix}${course.name} — ${topic.name}` : `${prefix}${course.name}`;

  if (v.taskType === "branch_exam") {
    const pub = v.branchExamPublisher?.trim();
    return pub ? `${base} - ${pub}` : base;
  }
  return base;
}

export async function createRichCustomTask(input: CreateRichTaskInput) {
  await assertNotImpersonating();
  const v = parseInput(createRichCustomTaskSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const title = buildRichTaskTitle(v);
  // Only "Soru Çözümü" gets to arrive already "done" -- every other type
  // (including a bare Toplam-only "Konu Çalışması" target) still needs
  // its own completion step, same as a coach-assigned one would.
  const hasFullResults = v.taskType === "question_bank" && v.totalCount != null;
  const takesCourseTopic = v.taskType === "question_bank" || v.taskType === "topic_study" || v.taskType === "branch_exam";
  const takesTotalCount = v.taskType !== "extra_custom" && v.taskType !== "general_exam";

  const { data, error } = await supabase
    .from("student_tasks")
    .insert({
      student_id: user.id,
      task_date: v.taskDate,
      task_type: v.taskType,
      title,
      description: v.taskType === "extra_custom" ? v.freeDescription?.trim() || null : null,
      // Forced for reading, same as the coach's own assignTaskToStudent --
      // routes it into the Rutinler lane via the "kitap-okuma" pseudo-course
      // (lib/curriculum's ROUTINE_COURSES) regardless of what courseId (none)
      // the dialog sent.
      course_id: v.taskType === "reading" ? "kitap-okuma" : takesCourseTopic ? v.courseId || null : null,
      topic_id: v.taskType === "question_bank" || v.taskType === "topic_study" ? v.topicId || null : null,
      total_count: takesTotalCount ? (v.totalCount ?? null) : null,
      correct_count: hasFullResults ? (v.correctCount ?? null) : null,
      wrong_count: hasFullResults ? (v.wrongCount ?? null) : null,
      empty_count: hasFullResults ? (v.emptyCount ?? null) : null,
      duration_minutes: v.durationMinutes ?? null,
      is_coach_assigned: false,
      status: hasFullResults ? "done" : "pending",
      completed: hasFullResults,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  if (v.resourceIds && v.resourceIds.length > 0) {
    const rows = v.resourceIds.map((resourceId, orderIndex) => ({ task_id: data.id, resource_id: resourceId, order_index: orderIndex }));
    const { error: linkError } = await supabase.from("task_resources").insert(rows);
    if (linkError) throw dbError(linkError);
  }

  if (hasFullResults) {
    await recomputeDailyStats(supabase, data.student_id, data.task_date);
  }

  revalidatePath("/student");
  return { ...data, resource_ids: v.resourceIds ?? [] };
}

// On-demand resource list for the rich dialog's Kaynak picker -- fetched
// only when the dialog is open and the course/type actually needs it
// (see ResourceCombobox), not eagerly on every dashboard load the way
// Kaynak Takibi's own page.tsx loads every course's resources upfront.
export async function getMyResourcesForCourse(courseId: string, kind: "study" | "branch_exam" = "study") {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const courseIdV = parseInput(z.string().trim().max(60), courseId);

  const { data, error } = await supabase
    .from("student_resources")
    .select("id, name")
    .eq("student_id", user.id)
    .eq("course_id", courseIdV)
    .eq("kind", kind)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error);
  return data as { id: string; name: string }[];
}

// --- Focus Timer sessions (resumable, cross-device) -----------------------
//
// A focus_sessions row (migration 0078) is the live/paused state of an
// in-progress session for one (student, task) pair -- created on Başlat,
// updated on every pause/resume/heartbeat, and always resolved (banked into
// tracked_duration_seconds, then deleted) before this function set is done
// with it: on Bitir/Vazgeç (endFocusSession), or transparently by
// startFocusSession/getActiveFocusSession finding a leftover one first.
//
// run_started_at is a timestamp, not a counter -- elapsed is always
// accumulated_seconds + (now - run_started_at) while running, computed
// fresh by whichever device asks, so no polling is required for a second
// device to see accurate progress. Reconciling a dangling "running" row
// (this device crashed, or a different device is asking) always banks
// through last_heartbeat_at, never "now" -- see liveElapsedSeconds/
// resumeFocusSession below, and end_focus_session in the migration.

const FOCUS_SESSION_STALE_MS = 3 * 60 * 60 * 1000; // 3 hours

type FocusSessionRow = {
  id: string;
  mode: "stopwatch" | "countdown";
  countdown_target_seconds: number | null;
  status: "running" | "paused";
  run_started_at: string | null;
  accumulated_seconds: number;
  last_heartbeat_at: string;
};

const focusModeSchema = z.enum(["stopwatch", "countdown"]);
// 1..180 minutes, matching the countdown picker's own custom-input cap
// (focus-timer-modal.tsx) -- null only ever pairs with "stopwatch".
const countdownTargetSchema = z.number().int().min(60).max(10_800).nullable();

async function getOwnFocusSession(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<FocusSessionRow | null> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("id, mode, countdown_target_seconds, status, run_started_at, accumulated_seconds, last_heartbeat_at")
    .eq("student_id", userId)
    .eq("task_id", taskId)
    .maybeSingle();
  if (error) throw dbError(error);
  return data as FocusSessionRow | null;
}

// Seconds elapsed in this session as of right now -- the wall-clock
// reconstruction described above.
function liveElapsedSeconds(session: FocusSessionRow): number {
  if (session.status !== "running" || !session.run_started_at) return session.accumulated_seconds;
  const ranMs = Date.now() - new Date(session.run_started_at).getTime();
  return session.accumulated_seconds + Math.max(0, Math.round(ranMs / 1000));
}

function isStaleSession(session: FocusSessionRow): boolean {
  return Date.now() - new Date(session.last_heartbeat_at).getTime() > FOCUS_SESSION_STALE_MS;
}

// Called right when the Focus Timer opens for a task -- returns the
// resumable state for the "Devam eden bir seansın var..." prompt, or null
// when there's genuinely nothing to resume. A row past the 3-hour
// staleness cutoff is auto-banked and cleared right here instead of ever
// being offered: a session abandoned that long ago isn't something to
// prompt "continue?" on, it's just focus time to credit quietly and move
// on from.
export async function getActiveFocusSession(taskId: string): Promise<{
  mode: "stopwatch" | "countdown";
  countdownTargetSeconds: number | null;
  status: "running" | "paused";
  elapsedSeconds: number;
} | null> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);

  const session = await getOwnFocusSession(supabase, user.id, taskIdV);
  if (!session) return null;

  if (isStaleSession(session)) {
    const { error } = await supabase.rpc("end_focus_session", {
      p_task_id: taskIdV,
      p_bank_through: session.last_heartbeat_at,
    });
    if (error) throw dbError(error);
    revalidatePath("/student");
    return null;
  }

  return {
    mode: session.mode,
    countdownTargetSeconds: session.countdown_target_seconds,
    status: session.status,
    elapsedSeconds: liveElapsedSeconds(session),
  };
}

// Starts a fresh session -- if one already existed for this task (whether
// still-live or stale), it's banked and cleared first, exactly like
// getActiveFocusSession's own staleness path, so choosing "Yeni Başlat"
// off the resume prompt never silently discards the old time, it just
// closes that session out before opening a new one.
export async function startFocusSession(
  taskId: string,
  mode: "stopwatch" | "countdown",
  countdownTargetSeconds: number | null,
): Promise<void> {
  await assertNotImpersonating();
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);
  const modeV = parseInput(focusModeSchema, mode);
  const countdownV = parseInput(countdownTargetSchema, countdownTargetSeconds);
  if (modeV === "countdown" && countdownV === null) {
    throw new Error("Geri sayım süresi seçilmedi.");
  }

  const { data: task, error: taskError } = await supabase
    .from("student_tasks")
    .select("student_id")
    .eq("id", taskIdV)
    .maybeSingle();
  if (taskError) throw dbError(taskError);
  if (!task || task.student_id !== user.id) throw new Error("Bu görev sana ait değil.");

  const existing = await getOwnFocusSession(supabase, user.id, taskIdV);
  if (existing) {
    const { error } = await supabase.rpc("end_focus_session", {
      p_task_id: taskIdV,
      p_bank_through: isStaleSession(existing) ? existing.last_heartbeat_at : new Date().toISOString(),
    });
    if (error) throw dbError(error);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("focus_sessions").upsert(
    {
      student_id: user.id,
      task_id: taskIdV,
      mode: modeV,
      countdown_target_seconds: modeV === "countdown" ? countdownV : null,
      status: "running",
      run_started_at: now,
      accumulated_seconds: 0,
      last_heartbeat_at: now,
    },
    { onConflict: "student_id,task_id" },
  );
  if (error) throw dbError(error);
}

// Resumes a session -- shared by the cross-device/crash resume prompt AND
// Mola Ver's own "Devam Et" (the same reconciliation is correct either way:
// when nothing went wrong, last_heartbeat_at is fresh enough that banking
// through it vs. through "now" makes no practical difference).
export async function resumeFocusSession(taskId: string): Promise<{ elapsedSeconds: number } | null> {
  await assertNotImpersonating();
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);

  const existing = await getOwnFocusSession(supabase, user.id, taskIdV);
  if (!existing) return null;

  const banked =
    existing.status === "running" && existing.run_started_at
      ? existing.accumulated_seconds +
        Math.max(
          0,
          Math.round(
            (new Date(existing.last_heartbeat_at).getTime() - new Date(existing.run_started_at).getTime()) / 1000,
          ),
        )
      : existing.accumulated_seconds;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("focus_sessions")
    .update({ status: "running", run_started_at: now, accumulated_seconds: banked, last_heartbeat_at: now })
    .eq("id", existing.id);
  if (error) throw dbError(error);

  return { elapsedSeconds: banked };
}

// Mola Ver -- banks the just-finished run segment (through "now", this is a
// live in-the-moment action) and flips to paused. A no-op if there's
// nothing running -- defensive: the beforeunload route handler
// (app/api/focus-checkpoint/route.ts) reuses this for a real tab close,
// which can race with a session that already ended some other way.
export async function pauseFocusSession(taskId: string): Promise<void> {
  await assertNotImpersonating();
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);

  const existing = await getOwnFocusSession(supabase, user.id, taskIdV);
  if (!existing || existing.status !== "running" || !existing.run_started_at) return;

  const ranSeconds = Math.max(0, Math.round((Date.now() - new Date(existing.run_started_at).getTime()) / 1000));
  const { error } = await supabase
    .from("focus_sessions")
    .update({
      status: "paused",
      run_started_at: null,
      accumulated_seconds: existing.accumulated_seconds + ranSeconds,
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (error) throw dbError(error);
}

// Fired every ~20s while running (FocusTimerModal), alongside the unrelated
// coach-live-status heartbeat (sendFocusHeartbeat above) -- purely refreshes
// the staleness/trust boundary described at the top of this section. A
// missed beat only widens the dead-air window a later reconciliation has to
// assume didn't happen, never a lost task update, so this deliberately
// doesn't throw on a missing/already-ended row.
export async function heartbeatFocusSession(taskId: string): Promise<void> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);

  await supabase
    .from("focus_sessions")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("student_id", user.id)
    .eq("task_id", taskIdV)
    .eq("status", "running");
}

// Bitir and Vazgeç both end here -- the only difference between them is
// client-side UX (a celebration screen vs. not), not what gets persisted.
// Banks through "now" (a live, in-the-moment end) and deletes the session
// row via end_focus_session (migration 0078). Returns the task's new
// cumulative tracked_duration_seconds total (null if there was no session
// to end), so the caller can show it without waiting on revalidation.
export async function endFocusSession(taskId: string): Promise<number | null> {
  await assertNotImpersonating();
  const supabase = await createClient();
  await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);

  const { data, error } = await supabase.rpc("end_focus_session", {
    p_task_id: taskIdV,
    p_bank_through: new Date().toISOString(),
  });
  if (error) throw dbError(error);

  if (data !== null) revalidatePath("/student");
  return data as number | null;
}

// Closes the one real gap left in the Focus Timer's persistence story:
// getActiveFocusSession/startFocusSession above only bank a stale session
// when the student reopens Süre Tut on that SAME task again. A student who
// closes the tab mid-session (beforeunload's sendBeacon best-effort pauses
// it, or even that never fires -- a crash, force-quit, the OS killing a
// backgrounded mobile tab) and simply never revisits that particular task
// has their accumulated seconds sitting in focus_sessions forever, never
// folded into tracked_duration_seconds -- invisible on the task's own
// badge, Toplam Süre, the Karne, and the stopwatch leaderboard alike, which
// reads exactly like data loss even though the raw seconds were never
// actually gone. Called once from fetchHomeData (app/student/page.tsx) on
// every dashboard load -- not just when a specific task's timer reopens --
// so a stranded session gets banked the next time the student opens the
// app at all. Best-effort by design (mirrors heartbeatFocusSession's own
// "never let this break the primary flow" stance): a failure here should
// never take the whole dashboard down with it.
export async function reconcileStaleFocusSessions(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const staleCutoff = new Date(Date.now() - FOCUS_SESSION_STALE_MS).toISOString();
  const { data: staleRows } = await supabase
    .from("focus_sessions")
    .select("task_id, last_heartbeat_at")
    .eq("student_id", user.id)
    .lt("last_heartbeat_at", staleCutoff);

  for (const row of staleRows ?? []) {
    await supabase.rpc("end_focus_session", { p_task_id: row.task_id, p_bank_through: row.last_heartbeat_at });
  }
}
