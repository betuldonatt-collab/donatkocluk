"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { computeAutoTaskStatus, countsAreConsistent, mergeDualTaskStatus, type DualPartStatus } from "@/lib/count-fields";
import { needsCoachApproval } from "@/lib/focus-approval";
import { decideOpenAction } from "@/lib/focus-open-decision";
import {
  EXAM_SCORES_REQUIRED,
  GENERAL_EXAM_SCORES_REQUIRED,
  findGeneralExamTotalMismatch,
  generalExamTotalMismatchMessage,
  isGeneralExamScoresIncomplete,
} from "@/lib/exam-results-validation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { mondayOf } from "@/lib/date";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import {
  EVIDENCE_BUCKET,
  EVIDENCE_MAX_BYTES,
  evidencePath,
  isEvidenceMimeType,
  isEvidencePathFor,
  normalizePhotoStatus,
  shouldHoldForEvidenceReview,
  withoutPath,
  withoutRejected,
  type PhotoStatusMap,
} from "@/lib/task-evidence";
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

// Paragraf ve Problem Çizelgesi (migration 0091): a "paragraf"/"problem"
// routine task's own counts ARE that day's chart entry now -- no separate
// manual re-entry. Re-derives (or removes) the one row tied to this task from
// its current state; best-effort, since the chart is a convenience on top of
// the task the student just successfully saved, not a reason to fail that save.
async function syncParagrafProblemEntry(supabase: SupabaseClient, taskId: string) {
  const { error } = await supabase.rpc("sync_paragraf_problem_entry", { p_task_id: taskId });
  if (error) console.error("[syncParagrafProblemEntry] failed:", error);
}

// LGS counterpart (migration 0092): a "paragraf" or "kitap-okuma" routine task
// feeds the LGS Paragraf/Kitap Okuma tracker instead (lgs_daily_routines) --
// the RPC itself only actually writes for an LGS student, so calling both this
// and syncParagrafProblemEntry for a shared course_id like "paragraf" is safe
// regardless of the task owner's cohort.
async function syncLgsDailyRoutineEntry(supabase: SupabaseClient, taskId: string) {
  const { error } = await supabase.rpc("sync_lgs_daily_routine_entry", { p_task_id: taskId });
  if (error) console.error("[syncLgsDailyRoutineEntry] failed:", error);
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
// Returns a result instead of throwing: a rejected Server Action promise that
// reaches the client uncaught (a bug in this function, or in anything it awaits
// -- a recompute call, a trigger, ...) surfaces in production as the opaque
// "Server Components render" message (React error #441) instead of a readable
// one, exactly the crash this app's evidence-review flow hit before it was
// changed to the same result pattern (see reviewEvidencePhotos in
// app/coach/actions.ts). A genuine validation problem (missing exam scores, a
// locked task, ...) is reported through `error` here, not thrown; anything
// truly unexpected is logged in full server-side (console + Sentry) and
// reported as a generic message rather than left to escape uncaught.
// `data` is the raw student_tasks row (same shape updateTaskProgress always
// returned) -- callers cast it to their own StudentTask type, same as before.
export type UpdateTaskProgressResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function updateTaskProgress(taskId: string, patch: TaskProgressPatch): Promise<UpdateTaskProgressResult> {
  try {
    const data = await updateTaskProgressInternal(taskId, patch);
    return { ok: true, data };
  } catch (e) {
    if (!(e instanceof Error)) {
      console.error("[updateTaskProgress] non-Error thrown:", e);
      Sentry.captureException(e);
      return { ok: false, error: GENERIC_DB_ERROR };
    }
    return { ok: false, error: e.message };
  }
}

async function updateTaskProgressInternal(taskId: string, patch: TaskProgressPatch) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const patchV = parseInput(taskProgressPatchSchema, patch);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select(
      "student_id, is_coach_assigned, is_approved_by_coach, task_type, title, status, evidence_image_paths, evidence_review_status, evidence_photo_status, total_count, correct_count, wrong_count, empty_count",
    )
    .eq("id", taskIdV)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  // Genel / Branş Denemesi results: every Doğru/Yanlış/Boş box is required
  // (0 for what wasn't solved) -- the same rule the forms check before
  // submitting, enforced here too so a forged or stale client can't save
  // blank (null) scores. A Genel Deneme needs a full row for every ders; a
  // Branş Denemesi needs all three counts once any of them is being written
  // (judged on the values the row will END UP with, so a partial patch on
  // top of already-complete counts still passes).
  if (existing.task_type === "general_exam" && patchV.subject_scores) {
    if (isGeneralExamScoresIncomplete(existing.title, patchV.subject_scores)) {
      throw new Error(GENERAL_EXAM_SCORES_REQUIRED);
    }
    const mismatch = findGeneralExamTotalMismatch(existing.title, patchV.subject_scores);
    if (mismatch) {
      throw new Error(generalExamTotalMismatchMessage(mismatch.label, mismatch.questions));
    }
  }
  if (
    existing.task_type === "branch_exam" &&
    ("correct_count" in patchV || "wrong_count" in patchV || "empty_count" in patchV)
  ) {
    const finalCorrect = "correct_count" in patchV ? patchV.correct_count : existing.correct_count;
    const finalWrong = "wrong_count" in patchV ? patchV.wrong_count : existing.wrong_count;
    const finalEmpty = "empty_count" in patchV ? patchV.empty_count : existing.empty_count;
    if (finalCorrect == null || finalWrong == null || finalEmpty == null) {
      throw new Error(EXAM_SCORES_REQUIRED);
    }
  }

  // Coach-assigned Toplam is the coach's own call -- the student only
  // ever changes how many they actually solved (Doğru/Yanlış/Boş). The UI
  // never renders an editable field for this case, but this is the
  // authoritative check (mirrored at the DB level by
  // prevent_student_task_core_tampering, migration 0077) -- a direct or
  // forged call gets the same clear rejection.
  //
  // general_exam is excluded: unlike question_bank/branch_exam, its
  // total_count is NEVER a coach-set target (always null at assignment --
  // see taskFormValueToPayload's general_exam branch) -- it's a rollup the
  // student's own per-subject scores recompute on every save
  // (buildCountsPatch's showSubjectScores branch, task-modal.tsx). Treating
  // it as an immutable coach target here rejected every legitimate Genel
  // Deneme save after the first one, with this same misleading message.
  if (
    existing.task_type !== "general_exam" &&
    existing.is_coach_assigned &&
    "total_count" in patchV &&
    patchV.total_count !== existing.total_count
  ) {
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

  // Kanıt Fotoğrafı: a task that carries photos is not completed on the
  // student's say-so. Marking it done / half done HOLDS it for the coach --
  // status stays 'pending', the claimed outcome is remembered, and it lands on
  // the coach's approval screen (getPendingStudentTasks) exactly like a
  // self-created extra task. approveStudentTask then applies the claimed status.
  // The DB trigger (0088) refuses the same write if it ever bypasses this.
  let evidenceHold: {
    evidence_review_status: "pending";
    evidence_pending_status: "done" | "half_done";
    evidence_photo_status: PhotoStatusMap;
  } | null = null;
  const claimedStatus = patchV.status;
  if (
    (claimedStatus === "done" || claimedStatus === "half_done") &&
    shouldHoldForEvidenceReview({
      inApprovalFlow: existing.is_coach_assigned || existing.is_approved_by_coach,
      photoCount: ((existing.evidence_image_paths ?? []) as string[]).length,
      status: claimedStatus,
      reviewStatus: existing.evidence_review_status ?? "none",
    })
  ) {
    // Resubmitting puts every photo the coach rejected back up for review; the
    // ones already approved stay approved.
    evidenceHold = {
      evidence_review_status: "pending",
      evidence_pending_status: claimedStatus,
      evidence_photo_status: withoutRejected(normalizePhotoStatus(existing.evidence_photo_status)),
    };
    patchV.status = "pending";
    patchV.completed = false;
  }

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ ...patchV, ...(evidenceHold ?? {}), updated_at: new Date().toISOString() })
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
  // Same trigger as the topic-stats resync just above: a Paragraf/Problem/
  // Kitap Okuma routine task's counts or status changed, so its chart entry
  // (YKS: paragraf_problem_entries, LGS: lgs_daily_routines) might need to
  // change, or stop existing, with it.
  let touchedParagrafProblemChart = false;
  if (SCORE_FIELDS.some((f) => f in patchV) || "status" in patchV) {
    if (data.course_id === "paragraf" || data.course_id === "problem") {
      await syncParagrafProblemEntry(supabase, data.id);
      touchedParagrafProblemChart = true;
    }
    if (data.course_id === "paragraf" || data.course_id === "kitap-okuma") {
      await syncLgsDailyRoutineEntry(supabase, data.id);
      touchedParagrafProblemChart = true;
    }
  }

  revalidatePath("/student");
  // Only for a task that could actually have changed that page's data --
  // revalidating it on every unrelated save (any Genel/Branş Deneme, any
  // ordinary task) was pure waste.
  if (touchedParagrafProblemChart) revalidatePath("/student/paragraf-problem");
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

// Never throws -- an uncaught rejection out of a Server Action is what
// surfaced to the student as a raw, unreadable React error #441 instead of
// a real message (see updateTaskProgress's own version of this fix, above).
// `data` is the raw coaching_sessions row; the modal doesn't currently use
// it beyond confirming success.
export type SubmitSessionRatingResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function submitSessionRating(
  sessionId: string,
  rating: number,
  feedback: string | null,
): Promise<SubmitSessionRatingResult> {
  try {
    const data = await submitSessionRatingInternal(sessionId, rating, feedback);
    return { ok: true, data };
  } catch (e) {
    if (!(e instanceof Error)) {
      console.error("[submitSessionRating] non-Error thrown:", e);
      Sentry.captureException(e);
      return { ok: false, error: GENERIC_DB_ERROR };
    }
    return { ok: false, error: e.message };
  }
}

async function submitSessionRatingInternal(sessionId: string, rating: number, feedback: string | null) {
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

// Returns a result instead of throwing -- same reason as updateTaskProgress
// just above (an uncaught Server Action rejection shows the browser the
// opaque "Server Components render" message instead of the real one).
export type SaveTaskAnalysisResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function saveTaskAnalysis(
  taskId: string,
  mistakes: { course_id: string; topic_id: string; status: "wrong" | "blank" }[],
  deferred: boolean,
): Promise<SaveTaskAnalysisResult> {
  try {
    const data = await saveTaskAnalysisInternal(taskId, mistakes, deferred);
    return { ok: true, data };
  } catch (e) {
    if (!(e instanceof Error)) {
      console.error("[saveTaskAnalysis] non-Error thrown:", e);
      Sentry.captureException(e);
      return { ok: false, error: GENERIC_DB_ERROR };
    }
    return { ok: false, error: e.message };
  }
}

// Replaces the full mistake-topic set for a task and resolves its
// analysis: `deferred` persists the counts only ("Analizi Sonra Yap"),
// leaving analysis_pending true and skipping the topic list entirely.
async function saveTaskAnalysisInternal(
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
// - Course pickers only ever offer atomic TYT/AYT courses, EXCEPT for
//   Branş Denemesi -- Kaynak Takibi's own tabs are atomic-only, so a
//   Soru Çözümü/Konu Çalışması task filed under a macro course would
//   silently be invisible there, and Paragraf/Problem's routine
//   pseudo-courses already have their own dedicated logging page. A
//   branch exam's Ders picker offers the macro groupings too (same as
//   the coach's own form) -- these feed the exam/trial analysis features
//   as their own saved data points, so this exception is intentional,
//   not an oversight.
// - "Soru Çözümü" and "Branş Denemesi" are the only two types that get
//   full one-step result entry (Toplam/Doğru/Yanlış/Boş) here, gated by
//   the explicit isCompleted toggle ("Bu çalışmayı tamamladın mı?")
//   rather than inferred from whether Toplam happened to be filled in --
//   the student states up front whether this is a future goal or
//   something already done (e.g. at school), and the form/status/
//   stopwatch all follow that one answer. "Genel Deneme" is always
//   created pending, same as a coach assignment, and completed
//   afterward through the existing TaskModal (which already has the
//   full subject-scores flow for that type) -- avoids re-building that
//   considerably more complex UI a second time here.
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
    // "Soru Çözümü"/"Branş Denemesi" only -- "Bu çalışmayı tamamladın
    // mı?". Ignored for every other task type (each already has its own
    // always-pending or always-full-results shape).
    isCompleted: z.boolean().nullable().optional(),
    generalExamTrack: z.enum(["tyt", "ayt", "lgs"]).nullable().optional(),
    generalExamPublisher: z.string().trim().max(200).nullable().optional(),
    branchExamPublisher: z.string().trim().max(200).nullable().optional(),
    freeTitle: z.string().trim().max(200).nullable().optional(),
    freeDescription: z.string().trim().max(2000).nullable().optional(),
    bookTitle: z.string().trim().max(300).nullable().optional(),
  })
  .refine(
    (v) =>
      v.taskType !== "branch_exam" ||
      v.isCompleted !== true ||
      (v.correctCount != null && v.wrongCount != null && v.emptyCount != null),
    { message: EXAM_SCORES_REQUIRED, path: ["correctCount"] },
  )
  .refine(
    (v) =>
      (v.taskType !== "question_bank" && v.taskType !== "branch_exam") ||
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
  isCompleted?: boolean | null;
  generalExamTrack?: "tyt" | "ayt" | "lgs" | null;
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
    const prefix = v.generalExamTrack === "ayt" ? "AYT" : v.generalExamTrack === "lgs" ? "LGS" : "TYT";
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
  // Only "Soru Çözümü"/"Branş Denemesi" ever arrive already "done", and
  // only when the student explicitly said so via isCompleted -- every
  // other type (including a bare Toplam-only "Konu Çalışması" target)
  // still needs its own completion step, same as a coach-assigned one
  // would.
  const hasFullResults = (v.taskType === "question_bank" || v.taskType === "branch_exam") && v.isCompleted === true;
  const takesCourseTopic = v.taskType === "question_bank" || v.taskType === "topic_study" || v.taskType === "branch_exam";
  const takesTotalCount = v.taskType !== "extra_custom" && v.taskType !== "general_exam";
  // A branch exam declared already-complete right here, with real misses,
  // still owes its topic-by-topic Deneme Analizi -- exactly the same
  // "Analiz bekliyor" badge/reminder/TaskModal step an already-existing
  // branch exam gets the moment a coach or student first records its
  // Doğru/Yanlış/Boş (see handleGoToAnalysis/handleDeferAnalysis in
  // task-modal.tsx). Without this, a perfect-score exam correctly needs
  // no follow-up, but one with any wrong/blank answers would otherwise
  // land already "done" with no visible next step at all -- indistinguishable
  // from an exam whose analysis was already finished.
  const hasMissedQuestions = v.taskType === "branch_exam" && ((v.wrongCount ?? 0) + (v.emptyCount ?? 0) > 0);

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
      // A task declared already-complete never takes a manual duration --
      // authoritative here, not just a UI hint, so a forged/stale client
      // payload can't sneak a duration onto an already-done task either.
      duration_minutes: hasFullResults ? null : (v.durationMinutes ?? null),
      is_coach_assigned: false,
      status: hasFullResults ? "done" : "pending",
      completed: hasFullResults,
      analysis_pending: hasFullResults && hasMissedQuestions,
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
// updated on every pause/resume, and resolved (banked into
// tracked_duration_seconds, then deleted) only when the student ends it
// (Bitir -> endFocusSession, or "Süre Tut" pressed again -> openFocusSessionForTask) or starts a new one on the same task.
//
// run_started_at is a timestamp, not a counter -- elapsed is always
// accumulated_seconds + (now - run_started_at) while running, so ANY device
// can compute it from the row alone, and it keeps counting whatever the
// browser is doing: a backgrounded tab, a switch to YouTube, another app on
// a phone, a closed laptop lid, navigating around the platform. The wall
// clock is the source of truth, never a client timer or a heartbeat.
//
// There is deliberately NO staleness rule and NO time cap here: a running
// session is credited through "now" whenever it is resumed or ended, however
// long it has been. (It used to bank only through the last 20s heartbeat and
// give up on anything older than 3 hours, which silently dropped the time
// after a tab/app switch -- browsers throttle or freeze a hidden tab's
// timers, so the heartbeat stops arriving.) A long session instead triggers
// the "Hâlâ çalışmaya devam ediyor musun?" check-in on the client
// (lib/focus-confirmation.ts) -- a question, never a cutoff.

// A PAUSED session nobody came back to is banked so its seconds reach the
// task's total, the Karne and the leaderboard instead of sitting in
// focus_sessions forever. Loss-free: a paused row's accumulated_seconds is
// already final. Never applied to a RUNNING session.
const PAUSED_SESSION_BANK_AFTER_MS = 3 * 60 * 60 * 1000;

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

// The student's currently RUNNING sessions, across every task -- what the
// floating widget (active-focus-session-widget.tsx) shows so a timer that
// is still counting stays visible and controllable after the student has
// left the page that started it. Best-effort by design: it feeds a widget
// in the layout, so a failure returns [] instead of breaking every page.
export type RunningFocusSession = {
  taskId: string;
  taskTitle: string;
  mode: "stopwatch" | "countdown";
  countdownTargetSeconds: number | null;
  elapsedSeconds: number;
  // Seconds already banked onto this task from EARLIER, already-ended
  // sessions -- separate from `elapsedSeconds` (this live, unbanked
  // stretch), so a student who took a Mola and came back sees the clock
  // continue from where they left off instead of restarting at 0. Never
  // credited again itself; only this session's own elapsedSeconds is
  // banked when it ends (endFocusSession), so there's no double count.
  priorTrackedSeconds: number;
};

export async function getRunningFocusSessions(): Promise<RunningFocusSession[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("focus_sessions")
      .select(
        "task_id, mode, countdown_target_seconds, status, run_started_at, accumulated_seconds, last_heartbeat_at, student_tasks(title, tracked_duration_seconds)",
      )
      .eq("student_id", user.id)
      .eq("status", "running");
    if (error) {
      // Still best-effort (this feeds a widget in the layout and must never
      // break a page) -- but logged, so an empty widget is diagnosable.
      console.error("[getRunningFocusSessions] read failed:", error);
      return [];
    }

    return (data ?? []).map((row) => {
      const task = Array.isArray(row.student_tasks) ? row.student_tasks[0] : row.student_tasks;
      return {
        taskId: row.task_id as string,
        taskTitle: (task?.title as string | undefined) ?? "Çalışma",
        mode: row.mode as "stopwatch" | "countdown",
        countdownTargetSeconds: row.countdown_target_seconds as number | null,
        elapsedSeconds: liveElapsedSeconds(row as unknown as FocusSessionRow),
        priorTrackedSeconds: (task?.tracked_duration_seconds as number | undefined) ?? 0,
      };
    });
  } catch (e) {
    console.error("[getRunningFocusSessions] failed:", e);
    return [];
  }
}

// Starts a fresh session -- if one already existed for this task it's banked
// (through now) and cleared first, so choosing "Yeni Başlat" off the resume
// prompt never silently discards the old time, it just closes that session
// out before opening a new one.
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
      p_bank_through: new Date().toISOString(),
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

// Resumes a session -- shared by the resume prompt AND Mola Ver's own
// "Devam Et". A running session is credited through NOW (its real
// wall-clock elapsed), so time that passed while the tab was in the
// background or the student was on another site is never dropped; a paused
// one resumes from exactly what it had.
export async function resumeFocusSession(taskId: string): Promise<{ elapsedSeconds: number } | null> {
  await assertNotImpersonating();
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const taskIdV = parseInput(uuidSchema, taskId);

  const existing = await getOwnFocusSession(supabase, user.id, taskIdV);
  if (!existing) return null;

  const banked = liveElapsedSeconds(existing);

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
// nothing running. Only ever called by an explicit Mola Ver click: closing
// or leaving the page no longer pauses anything, the session just keeps
// counting.
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

// Fired every ~20s while running (FocusTimerModal / the floating widget),
// alongside the unrelated coach-live-status heartbeat (sendFocusHeartbeat
// above). It is purely informational now -- elapsed time and crediting never
// depend on it (a hidden tab's timers are throttled, so beats arrive late or
// not at all, and that must not cost the student any time). A missed beat is
// harmless, so this deliberately doesn't throw on a missing/already-ended
// row.
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

// --- ending / banking a session -------------------------------------------
//
// A session is closed out (its time credited to the task, its row deleted) by
// end_focus_session (migration 0078/0086). It always banks through "now" -- the
// full wall-clock elapsed -- so nothing is ever dropped; a session longer than
// 6 hours is NOT credited but parked for the coach's approval (lib/
// focus-approval.ts). `creditedSeconds` is the one way a session is credited
// with LESS than it ran: the student answering "Hayır, bitir" on the "Hâlâ
// çalışmaya devam ediyor musun?" check-in may correct the figure downwards. It
// can never exceed the real elapsed time, and only that explicit student choice
// ever passes it -- nothing on the system side trims a session.
//
// Throws raw errors (PostgREST error objects keep their SQLSTATE `code`); the
// two public actions below turn them into a result.

async function bankFocusSession(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  session: FocusSessionRow | null,
  creditedSeconds?: number,
): Promise<{ totalSeconds: number | null; bankedSeconds: number; pendingApproval: boolean }> {
  // What this session will bank: its full wall-clock elapsed, or the shorter
  // figure the student chose. Mirrors the > 6h rule in end_focus_session (the
  // database is what actually enforces it).
  const bankedSeconds = session
    ? creditedSeconds !== undefined
      ? Math.min(creditedSeconds, liveElapsedSeconds(session))
      : liveElapsedSeconds(session)
    : 0;

  if (session && creditedSeconds !== undefined) {
    // Freeze the row at the chosen amount; end_focus_session below then banks
    // exactly that (a paused row contributes its accumulated_seconds).
    const { error: trimError } = await supabase
      .from("focus_sessions")
      .update({ status: "paused", run_started_at: null, accumulated_seconds: bankedSeconds })
      .eq("id", session.id);
    if (trimError) throw trimError;
  }

  const { data, error } = await supabase.rpc("end_focus_session", {
    p_task_id: taskId,
    p_bank_through: new Date().toISOString(),
  });
  if (error) throw error;

  if (session) revalidatePath("/student");

  // Only claim "sent to the coach" if the database really parked it: confirm a
  // fresh pending review exists rather than trusting the prediction above (it
  // wouldn't, e.g., if migration 0086 hasn't been applied).
  let pendingApproval = false;
  if (session && needsCoachApproval(bankedSeconds)) {
    const { data: review } = await supabase
      .from("focus_session_reviews")
      .select("id")
      .eq("student_id", userId)
      .eq("task_id", taskId)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    pendingApproval = (review?.length ?? 0) > 0;
  }

  return { totalSeconds: data as number | null, bankedSeconds, pendingApproval };
}

// Returns a result instead of throwing: a thrown Error's message is replaced by
// a generic one in production builds. A failure is logged with its Postgres
// code and returned with a short reference (the SQLSTATE, e.g. 42501 = missing
// permission) so it can be diagnosed; the session itself is untouched on
// failure, so nothing is lost and ending it can simply be retried.
function focusActionError(label: string, e: unknown): string {
  console.error(`[${label}] failed:`, e);
  Sentry.captureException(e);
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : null;
  if (code) return `Odak süresi kaydedilemedi (hata kodu: ${code}).`;
  return e instanceof Error ? e.message : GENERIC_DB_ERROR;
}

export type EndFocusSessionResult =
  | { ok: true; totalSeconds: number | null; pendingApproval: boolean }
  | { ok: false; error: string };

// creditedSeconds is optional; null is accepted as "not given" too, since an
// omitted argument can arrive as null across the Server Action boundary.
const creditedSecondsSchema = z.number().int().min(0).max(86_400).nullish();

// Bitir (and "Hayır, bitir" on the check-in) end here.
export async function endFocusSession(taskId: string, creditedSeconds?: number | null): Promise<EndFocusSessionResult> {
  try {
    await assertNotImpersonating();
    const supabase = await createClient();
    const user = await requireUser(supabase);
    const taskIdV = parseInput(uuidSchema, taskId);
    const creditedV = parseInput(creditedSecondsSchema, creditedSeconds) ?? undefined;

    const session = await getOwnFocusSession(supabase, user.id, taskIdV);
    const banked = await bankFocusSession(supabase, user.id, taskIdV, session, creditedV);
    return { ok: true, totalSeconds: banked.totalSeconds, pendingApproval: banked.pendingApproval };
  } catch (e) {
    return { ok: false, error: focusActionError("endFocusSession", e) };
  }
}

// Called when "Süre Tut" is pressed on a task. There is no "resume?" question:
//   * nothing on the server           -> "none": open a fresh timer.
//   * a leftover (paused, or running but its page has gone quiet) session
//                                     -> "banked": its time is credited on the
//                                        spot and the student is told how much.
//   * a session that is alive right now (running elsewhere / the floating
//     widget / another device, or past the 3-hour check-in)
//                                     -> "attach": show it, already running --
//                                        banking it would end a timer the
//                                        student is actively using.
// See lib/focus-open-decision.ts for the rule.
export type OpenFocusSessionResult =
  | { kind: "none" }
  | {
      kind: "attach";
      mode: "stopwatch" | "countdown";
      countdownTargetSeconds: number | null;
      elapsedSeconds: number;
      // Seconds already banked from earlier, already-ended sessions on this
      // same task -- see RunningFocusSession's own field for why.
      priorTrackedSeconds: number;
    }
  | { kind: "banked"; seconds: number; pendingApproval: boolean; priorTrackedSeconds: number }
  | { kind: "error"; error: string };

export async function openFocusSessionForTask(taskId: string): Promise<OpenFocusSessionResult> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    const taskIdV = parseInput(uuidSchema, taskId);

    const session = await getOwnFocusSession(supabase, user.id, taskIdV);
    if (!session) return { kind: "none" };

    const elapsedSeconds = liveElapsedSeconds(session);
    const decision = decideOpenAction({
      status: session.status,
      lastHeartbeatAt: session.last_heartbeat_at,
      elapsedSeconds,
    });

    if (decision === "attach") {
      const { data: task } = await supabase
        .from("student_tasks")
        .select("tracked_duration_seconds")
        .eq("id", taskIdV)
        .maybeSingle();
      return {
        kind: "attach",
        mode: session.mode,
        countdownTargetSeconds: session.countdown_target_seconds,
        elapsedSeconds,
        priorTrackedSeconds: (task?.tracked_duration_seconds as number | undefined) ?? 0,
      };
    }

    await assertNotImpersonating();
    const banked = await bankFocusSession(supabase, user.id, taskIdV, session);
    return {
      kind: "banked",
      seconds: banked.bankedSeconds,
      pendingApproval: banked.pendingApproval,
      priorTrackedSeconds: banked.totalSeconds ?? 0,
    };
  } catch (e) {
    return { kind: "error", error: focusActionError("openFocusSessionForTask", e) };
  }
}

// Banks PAUSED sessions the student never came back to (they took a break
// and closed the app), so their seconds reach the task's total, the Karne and
// the stopwatch leaderboard instead of sitting in focus_sessions forever.
// Called once from fetchHomeData (app/student/page.tsx) on every dashboard
// load. Loss-free -- a paused row's accumulated_seconds is already final --
// and it NEVER touches a running session: a running one keeps counting
// (however long) and is resolved by the student, with the "Hâlâ çalışmaya
// devam ediyor musun?" check-in as the safeguard. Best-effort (mirrors
// heartbeatFocusSession's "never let this break the primary flow" stance):
// a failure here should never take the whole dashboard down with it.
export async function reconcileStaleFocusSessions(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const cutoff = new Date(Date.now() - PAUSED_SESSION_BANK_AFTER_MS).toISOString();
  const { data: pausedRows } = await supabase
    .from("focus_sessions")
    .select("task_id, last_heartbeat_at")
    .eq("student_id", user.id)
    .eq("status", "paused")
    .lt("last_heartbeat_at", cutoff);

  for (const row of pausedRows ?? []) {
    await supabase.rpc("end_focus_session", { p_task_id: row.task_id, p_bank_through: row.last_heartbeat_at });
  }
}

// --- Kanıt Fotoğrafı (photo evidence of finished work, migrations 0087/0088) --
//
// The browser compresses the photo (lib/image-compress.ts) and posts it here as
// FormData; the server stores it in the private `task_evidence` bucket under
// <student_id>/<task_id>/ (Storage RLS re-checks that folder) and records the
// object path on the task. There is no limit on how many photos a task can have.
// Every action returns a result object instead of throwing, so the Turkish
// reason survives production error stripping.
//
// Completing a photo-backed task needs the coach's approval: see the hold in
// updateTaskProgress above, and the same rule applied here when photos are added
// to a task that is already marked done.

// `detail` says exactly which step failed ("task" = reading the task, "upload" =
// writing to Storage, "record" = saving the path on the task, "remove" = deleting
// the file) plus the underlying code/message, so a failure can be diagnosed from
// the screen without digging through server logs.
export type EvidenceResult =
  | { ok: true; paths: string[]; reviewStatus: string; status: string; photoStatus: PhotoStatusMap }
  | { ok: false; error: string; detail?: string };

// A failure at one named step of an evidence action.
class EvidenceStepError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}

const STEP_MESSAGES: Record<string, string> = {
  task: "Görev bilgisi okunamadı.",
  upload: "Fotoğraf depolamaya yüklenemedi.",
  record: "Fotoğraf yüklendi ama göreve kaydedilemedi.",
  remove: "Fotoğraf silinemedi.",
};

// Logs the real error (server log + Sentry, tagged with the step) and turns it
// into an EvidenceStepError carrying the step, the error code/status and message.
function evidenceStepError(step: keyof typeof STEP_MESSAGES, error: unknown): EvidenceStepError {
  console.error(`[evidence:${step}]`, error);
  Sentry.captureException(error, { tags: { evidence_step: step } });
  const e = (error ?? {}) as { message?: unknown; code?: unknown; statusCode?: unknown; status?: unknown };
  const code = e.code ?? e.statusCode ?? e.status;
  const message = typeof e.message === "string" ? e.message.slice(0, 200) : null;
  return new EvidenceStepError(STEP_MESSAGES[step], [step, code, message].filter((x) => x !== null && x !== undefined && x !== "").join(" · "));
}

async function loadOwnEvidence(supabase: SupabaseClient, userId: string, taskId: string) {
  const { data, error } = await supabase
    .from("student_tasks")
    .select(
      "student_id, task_date, course_id, topic_id, status, is_coach_assigned, is_approved_by_coach, evidence_image_paths, evidence_review_status, evidence_pending_status, evidence_photo_status",
    )
    .eq("id", taskId)
    .eq("student_id", userId)
    .maybeSingle();
  if (error) throw evidenceStepError("task", error);
  if (!data) throw new Error("Bu görev sana ait değil.");
  return { ...data, paths: (data.evidence_image_paths ?? []) as string[], photoStatus: normalizePhotoStatus(data.evidence_photo_status) };
}

function evidenceError(label: string, e: unknown): { ok: false; error: string; detail?: string } {
  if (e instanceof EvidenceStepError) return { ok: false, error: e.message, detail: e.detail };
  console.error(`[${label}] failed:`, e);
  Sentry.captureException(e);
  return { ok: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR, detail: `${label} · ${e instanceof Error ? e.name : typeof e}` };
}

export async function uploadTaskEvidence(formData: FormData): Promise<EvidenceResult> {
  try {
    await assertNotImpersonating();
    const taskId = parseInput(uuidSchema, formData.get("taskId"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Fotoğraf seçilmedi." };
    if (!isEvidenceMimeType(file.type)) return { ok: false, error: "Sadece JPEG, PNG veya WebP fotoğraf yükleyebilirsin." };
    if (file.size > EVIDENCE_MAX_BYTES) return { ok: false, error: "Fotoğraf çok büyük. Daha küçük bir fotoğraf dene." };

    const supabase = await createClient();
    const user = await requireUser(supabase);
    const task = await loadOwnEvidence(supabase, user.id, taskId);

    const path = evidencePath(user.id, taskId, crypto.randomUUID(), file.type);
    // Sent as plain bytes rather than the File object the Server Action received:
    // that object comes from the framework's own FormData implementation, and a
    // raw buffer avoids any cross-implementation quirk when it is re-posted to Storage.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw evidenceStepError("upload", uploadError);

    const paths = [...task.paths, path];
    // Photos added to a task already marked done / half done put it back in
    // front of the coach.
    const hold = shouldHoldForEvidenceReview({
      inApprovalFlow: task.is_coach_assigned || task.is_approved_by_coach,
      photoCount: paths.length,
      status: task.status,
      reviewStatus: task.evidence_review_status ?? "none",
    });
    const photoStatus = hold ? withoutRejected(task.photoStatus) : task.photoStatus;
    const update = hold
      ? {
          evidence_image_paths: paths,
          status: "pending",
          completed: false,
          evidence_review_status: "pending",
          evidence_pending_status: task.status,
          evidence_photo_status: photoStatus,
          updated_at: new Date().toISOString(),
        }
      : { evidence_image_paths: paths, updated_at: new Date().toISOString() };

    const { error: updateError } = await supabase.from("student_tasks").update(update).eq("id", taskId).eq("student_id", user.id);
    if (updateError) {
      // e.g. the coach locked this week meanwhile -- don't leave an orphan file.
      await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
      throw evidenceStepError("record", updateError);
    }

    if (hold) await resyncAfterStatusChange(supabase, task);

    revalidatePath("/student");
    return {
      ok: true,
      paths,
      reviewStatus: hold ? "pending" : (task.evidence_review_status ?? "none"),
      status: hold ? "pending" : task.status,
      photoStatus,
    };
  } catch (e) {
    return evidenceError("uploadTaskEvidence", e);
  }
}

// A held / released task changes what counts as "done" for its day and topic.
// Best-effort: the photo and the review state are already saved, so a hiccup in
// these rollups must not turn a successful upload into an error (they re-sync on
// the student's next save anyway).
async function resyncAfterStatusChange(
  supabase: SupabaseClient,
  task: { task_date: string; course_id: string | null; topic_id: string | null; student_id: string },
) {
  try {
    await recomputeDailyStats(supabase, task.student_id, task.task_date);
    if (task.course_id) await recomputeTopicStats(supabase, task.student_id, task.course_id, task.topic_id);
  } catch (e) {
    console.error("[evidence:resync] stats rollup failed (upload itself succeeded):", e);
  }
}

export async function removeTaskEvidence(taskId: string, path: string): Promise<EvidenceResult> {
  try {
    await assertNotImpersonating();
    const taskIdV = parseInput(uuidSchema, taskId);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    if (!isEvidencePathFor(path, user.id, taskIdV)) return { ok: false, error: "Geçersiz fotoğraf." };

    const task = await loadOwnEvidence(supabase, user.id, taskIdV);
    if (!task.paths.includes(path)) {
      return {
        ok: true,
        paths: task.paths,
        reviewStatus: task.evidence_review_status ?? "none",
        status: task.status,
        photoStatus: task.photoStatus,
      };
    }

    const paths = task.paths.filter((p) => p !== path);
    // Removing the last photo takes the task out of the review: a task waiting on
    // the coach goes back to the outcome the student had claimed (no photos, no
    // proof to review); a rejected one simply clears the rejection.
    const release = paths.length === 0 && (task.evidence_review_status === "pending" || task.evidence_review_status === "rejected");
    const restoredStatus = task.evidence_review_status === "pending" ? (task.evidence_pending_status ?? "done") : task.status;
    // The photo's verdict goes with it.
    const photoStatus = release ? {} : withoutPath(task.photoStatus, path);
    const update = release
      ? {
          evidence_image_paths: paths,
          evidence_review_status: "none",
          evidence_pending_status: null,
          evidence_photo_status: photoStatus,
          status: restoredStatus,
          completed: restoredStatus === "done",
          updated_at: new Date().toISOString(),
        }
      : { evidence_image_paths: paths, evidence_photo_status: photoStatus, updated_at: new Date().toISOString() };

    const { error: updateError } = await supabase.from("student_tasks").update(update).eq("id", taskIdV).eq("student_id", user.id);
    if (updateError) throw evidenceStepError("record", updateError);

    const { error: removeError } = await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
    if (removeError) console.error("[removeTaskEvidence] could not delete the file:", removeError);

    if (release && restoredStatus !== task.status) await resyncAfterStatusChange(supabase, task);

    revalidatePath("/student");
    return {
      ok: true,
      paths,
      reviewStatus: release ? "none" : (task.evidence_review_status ?? "none"),
      status: release ? restoredStatus : task.status,
      photoStatus,
    };
  } catch (e) {
    return evidenceError("removeTaskEvidence", e);
  }
}

// Short-lived signed URLs (the bucket is private) for the student's own photos
// of one task, in the same order as evidence_image_paths.
export async function getTaskEvidenceUrls(taskId: string): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  try {
    const taskIdV = parseInput(uuidSchema, taskId);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    const task = await loadOwnEvidence(supabase, user.id, taskIdV);
    const paths = task.paths.filter((p) => isEvidencePathFor(p, user.id, taskIdV));
    if (paths.length === 0) return { ok: true, urls: [] };
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 3600);
    if (error) throw error;
    return { ok: true, urls: (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u) };
  } catch (e) {
    return evidenceError("getTaskEvidenceUrls", e);
  }
}
