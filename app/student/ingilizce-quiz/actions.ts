"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { nextWordProgress, selectQuizBatch, type QuizWord, type WordProgressSummary } from "@/lib/lgs-vocab";
import { EXTRA_STUDY_TITLE, isOpenEndedExtra, pickVocabQuizTask, taskAfterAnswer, taskAfterRun } from "@/lib/vocab-quiz-task";

// Logs the real error server-side (console + Sentry) and, when it carries a
// Postgres/PostgREST error code (an RLS denial, a missing grant, a check
// constraint, ...), surfaces that code in the message instead of a fully
// generic one -- same reasoning as focusActionError in app/student/
// actions.ts. A bare "Beklenmeyen bir hata oluştu" with no code is
// impossible to tell apart from "nothing went wrong, you just haven't
// answered enough right yet" -- exactly what let a genuine write failure on
// student_word_progress go unnoticed here: EXACT_MATCH auto-advances to the
// next word in under a second, wiping this message before anyone had a
// chance to read it, and the generic text gave no reason to suspect
// anything was actually broken.
function vocabActionError(label: string, e: unknown, what = "Kelime ilerlemesi"): string {
  console.error(`[${label}] failed:`, e);
  Sentry.captureException(e);
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : null;
  if (code) return `${what} kaydedilemedi (hata kodu: ${code}).`;
  return e instanceof Error ? e.message : GENERIC_DB_ERROR;
}

// An update that RLS filtered out (a week the coach locked, a task that is no longer the student's) is not an error to PostgREST: it matches
// no row and answers "success". Every task write below asks for the updated row back and treats an empty answer as a failure, so the quiz
// never shows "Görevin tamamlandı" for a status the database did not take.
const TASK_NOT_UPDATED = "Görev durumu güncellenemedi (bu haftanın görevleri kilitli olabilir).";
class TaskNotUpdatedError extends Error {
  constructor() {
    super(TASK_NOT_UPDATED);
  }
}
function taskWriteMessage(label: string, e: unknown): string {
  if (e instanceof TaskNotUpdatedError) {
    console.error(`[${label}] no row updated`);
    return TASK_NOT_UPDATED;
  }
  return vocabActionError(label, e, "Görev durumu");
}

// Every action here returns its outcome instead of throwing -- reads
// included, unlike app/student/paragraf-problem/lgs-actions.ts's
// getMoreLgsEntries (which throws and relies on its caller's own
// try/catch). That worked there because nothing renders the caught
// error's raw .message; this feature's own quiz session does, straight
// into the card, and a THROWN error's real message is stripped to an
// opaque "Minified React error #441..." once it crosses the Server Action
// boundary in a production build -- silently swapping every friendly
// Turkish message this file writes for that instead. Returning the
// outcome as a plain value sidesteps that entirely: it's just data, never
// treated as an "error" crossing the boundary, so it always reaches the
// client exactly as written.
type GetVocabQuizBatchResult = { ok: true; words: QuizWord[] } | { ok: false; error: string };
type GetActiveVocabQuizTaskResult = { ok: true; task: ActiveVocabQuizTask | null } | { ok: false; error: string };
type CompleteRunResult = { ok: true; status: "done" | "half_done" | "unchanged" } | { ok: false; error: string };
type NotDoneResult = { ok: true } | { ok: false; error: string };
// nextCount is this word's own correct_count AFTER this answer (unchanged on a miss/skip -- nothing already earned is taken
// back) -- the quiz session's per-word level dots and the dashboard's tier counters render straight off it, authoritative over
// whatever they optimistically guessed the instant the answer was given. isMastered / firstCorrect say whether THIS answer
// crossed the 3rd correct answer / was the word's very first correct one. taskCompleted is the same idea for an assigned
// vocab_quiz task's own word-count target (see activeTaskId below).
type SubmitAnswerResult =
  | {
      ok: true;
      isMastered: boolean;
      firstCorrect: boolean;
      taskCompleted: boolean;
      nextCount: number;
      taskError?: string | null;
      // Set when THIS answer bound the quiz to a task it just found or created (today's "Ek Çalışma"); the counters already include the answer.
      boundTask?: ActiveVocabQuizTask | null;
    }
  | { ok: false; error: string };

async function requireUserId() {
  await assertNotImpersonating();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return { supabase, userId: user.id };
}

async function requireUserIdReadOnly() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return { supabase, userId: user.id };
}

const unitNumberSchema = z.number().int().min(1).max(10);
const batchLimitSchema = z.number().int().min(1).max(50);

// Up to `limit` not-yet-mastered words for this unit, in a completely random order (selectQuizBatch, lib/lgs-vocab.ts).
// Two plain queries instead of one join: lgs_words has
// no per-student scoping to push down, and a left-join-with-null-or-false
// filter across two tables isn't a single clean PostgREST filter, while
// this is a handful of rows either way (a unit's word list is small).
export async function getVocabQuizBatch(unitNumber: number, limit = 10): Promise<GetVocabQuizBatchResult> {
  try {
    const unitV = parseInput(unitNumberSchema, unitNumber);
    const limitV = parseInput(batchLimitSchema, limit);
    const { supabase, userId } = await requireUserIdReadOnly();

    const { data: words, error: wordsError } = await supabase
      .from("lgs_words")
      .select("id, english_word, turkish_meaning")
      .eq("unit_number", unitV);
    if (wordsError) throw wordsError;
    if (!words || words.length === 0) return { ok: true, words: [] };

    const wordIds = words.map((w) => w.id);
    const { data: progressRows, error: progressError } = await supabase
      .from("student_word_progress")
      .select("word_id, correct_count, is_mastered, last_tested_at")
      .eq("student_id", userId)
      .in("word_id", wordIds);
    if (progressError) throw progressError;

    const progressByWordId = new Map<string, WordProgressSummary>(
      (progressRows ?? []).map((p) => [
        p.word_id,
        { correct_count: p.correct_count, is_mastered: p.is_mastered, last_tested_at: p.last_tested_at },
      ]),
    );
    return { ok: true, words: selectQuizBatch(words, progressByWordId, limitV) };
  } catch (e) {
    return { ok: false, error: vocabActionError("getVocabQuizBatch", e) };
  }
}

// target is null for a task assigned without a word count (the run itself is then the task).
export type ActiveVocabQuizTask = { id: string; target: number | null; current: number };

// The assigned "N. Ünite - M Kelime" task (if any) this quiz run belongs to -- Ders Atama (task-form-fields.tsx) stores it as task_type
// 'vocab_quiz', course_id "ingilizce-quiz", topic_id the Ünite number as plain text, total_count the word-count target (or none).
//   * Opened from a task's "Quize Başla" (taskId given): exactly THAT task, if it is this student's, still open and for this unit.
//   * Opened from the sidebar / a unit card: the unit's open task due today; else the most recent unlocked open one from before today
//     (pickVocabQuizTask). Neither: null here, and the first answer then records the practice as today's "Ek Çalışma" (ensureExtraTask).
//     Before, the LATEST date won -- a week of answers went to next Sunday's task and today's stayed untouched.
// Correct answers climb its correct_count (submitVocabAnswer below) and the quiz sets its status (lib/vocab-quiz-task.ts).
export async function getActiveVocabQuizTask(unitNumber: number, taskId?: string | null): Promise<GetActiveVocabQuizTaskResult> {
  try {
    const unitV = parseInput(unitNumberSchema, unitNumber);
    const taskIdV = taskId ? parseInput(uuidSchema, taskId) : null;
    const { supabase, userId } = await requireUserIdReadOnly();
    let query = supabase
      .from("student_tasks")
      .select("id, total_count, correct_count, task_date")
      .eq("student_id", userId)
      .eq("task_type", "vocab_quiz")
      .eq("topic_id", String(unitV))
      .neq("status", "done");
    if (taskIdV) query = query.eq("id", taskIdV);
    const { data, error } = await query.order("task_date", { ascending: false }).limit(60);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; total_count: number | null; correct_count: number | null; task_date: string }[];
    let row: (typeof rows)[number] | null;
    if (taskIdV) {
      row = rows[0] ?? null;
    } else {
      // A task dated before the latest week lock is frozen (same boundary as the board's week_locked and the database rules).
      const { data: lock } = await supabase.from("progress_locks").select("locked_at").eq("student_id", userId).order("locked_at", { ascending: false }).limit(1).maybeSingle();
      const lockedBefore = (lock as { locked_at?: string } | null)?.locked_at?.slice(0, 10) ?? null;
      row = pickVocabQuizTask(rows, new Date().toISOString().slice(0, 10), lockedBefore);
    }
    if (!row) return { ok: true, task: null };
    return { ok: true, task: { id: row.id, target: row.total_count, current: row.correct_count ?? 0 } };
  } catch (e) {
    return { ok: false, error: vocabActionError("getActiveVocabQuizTask", e) };
  }
}

type TaskRow = { id: string; student_id: string; total_count: number | null; correct_count: number | null; status: string; is_coach_assigned: boolean | null };

// Today's "Ek Çalışma" for this unit: the student's own extra practice, created the first time they answer with nothing assigned to bind to
// (every assigned task is done, locked or none exists). One per day and unit -- a later run the same day finds it again (and re-opens it,
// see isOpenEndedExtra) instead of piling up cards. It is the student's own task like any they add themselves, so it waits for the coach's
// approval before it counts toward the program percentages (a deliberate rule, migration 0063: a student cannot approve their own work).
async function ensureExtraTask(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, unit: number): Promise<TaskRow> {
  const today = new Date().toISOString().slice(0, 10);
  const columns = "id, student_id, total_count, correct_count, status, is_coach_assigned";
  const { data: existing, error: readError } = await supabase
    .from("student_tasks")
    .select(columns)
    .eq("student_id", userId)
    .eq("task_type", "vocab_quiz")
    .eq("topic_id", String(unit))
    .eq("task_date", today)
    .eq("is_coach_assigned", false)
    .is("total_count", null)
    .eq("title", EXTRA_STUDY_TITLE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing as TaskRow;
  const { data: created, error } = await supabase
    .from("student_tasks")
    .insert({
      student_id: userId,
      task_date: today,
      task_type: "vocab_quiz",
      title: EXTRA_STUDY_TITLE,
      course_id: "ingilizce-quiz",
      topic_id: String(unit),
      total_count: null,
      is_coach_assigned: false,
      status: "pending",
      completed: false,
    })
    .select(columns)
    .single();
  if (error) throw error;
  return created as TaskRow;
}

// Upserts this student's progress for one word (nextWordProgress, lib/lgs-vocab.ts): correct adds one to correct_count
// (mastered once it reaches 3 IN TOTAL, not in a row) and extends the streak; incorrect (including a "Pas Geç" skip -- the
// caller passes isCorrect: false for that too) leaves correct_count as it is and only resets the streak. last_tested_at
// always moves to now, whichever way it went.
//
// activeTaskId (getActiveVocabQuizTask above) additionally bumps that
// assigned task's own correct_count by one -- but ONLY on a correct
// answer; a miss/skip resets the WORD's own streak, never the task's
// cumulative progress toward its target, since the target is "answer N
// correctly", not "N correct in a row". Marks the task done the moment it
// reaches its target (lib/vocab-quiz-task.ts: exactly the target, any answer makes it
// Yarım Yapıldı) -- an LGS vocab_quiz task is exempted from the
// Kanıt Fotoğrafı/evidence-hold gate entirely (lgsCompletionProblem), so
// this can set status/completed directly with no extra approval step.
// The WORD's own progress is saved first and is what the quiz depends on: a task that cannot be updated
// (locked week, ...) is reported in taskError and never discards the word's result.
export async function submitVocabAnswer(
  wordId: string,
  isCorrect: boolean,
  activeTaskId?: string | null,
  // The quiz is not bound to any task yet (the sidebar start, nothing open to bind to): this unit's answers are recorded as today's
  // "Ek Çalışma", created on the first answer (never just by opening the quiz).
  extraUnit?: number | null,
): Promise<SubmitAnswerResult> {
  try {
    const wordIdV = parseInput(uuidSchema, wordId);
    const isCorrectV = parseInput(z.boolean(), isCorrect);
    const { supabase, userId } = await requireUserId();

    const { data: existing, error: fetchError } = await supabase
      .from("student_word_progress")
      .select("correct_count, correct_streak")
      .eq("student_id", userId)
      .eq("word_id", wordIdV)
      .maybeSingle();
    if (fetchError) throw fetchError;

    const next = nextWordProgress(
      { correctCount: existing?.correct_count ?? 0, correctStreak: existing?.correct_streak ?? 0 },
      isCorrectV,
    );
    const { error } = await supabase.from("student_word_progress").upsert(
      {
        student_id: userId,
        word_id: wordIdV,
        correct_count: next.correctCount,
        correct_streak: next.correctStreak,
        is_mastered: next.isMastered,
        last_tested_at: new Date().toISOString(),
      },
      { onConflict: "student_id,word_id" },
    );
    if (error) throw error;

    let taskCompleted = false;
    let taskError: string | null = null;
    let boundTask: ActiveVocabQuizTask | null = null;
    if (activeTaskId || extraUnit) {
      try {
        let task: TaskRow | null = null;
        const justBound = !activeTaskId;
        if (activeTaskId) {
          const activeTaskIdV = parseInput(uuidSchema, activeTaskId);
          const { data, error: taskFetchError } = await supabase
            .from("student_tasks")
            .select("id, student_id, total_count, correct_count, status, is_coach_assigned")
            .eq("id", activeTaskIdV)
            .maybeSingle();
          if (taskFetchError) throw taskFetchError;
          task = (data as TaskRow | null) ?? null;
        } else {
          task = await ensureExtraTask(supabase, userId, parseInput(unitNumberSchema, extraUnit));
        }
        // Silently skipped, not an error: the task may have been completed or removed by the coach between this batch loading and this
        // answer -- the word's own progress above is already saved either way.
        if (task && task.student_id === userId) {
          // ANY answer makes the task at least Yarım Yapıldı, a correct one also counts toward the word target, and reaching the target
          // makes it Yapıldı -- the student never sets these (lib/vocab-quiz-task.ts). A miss or a Pas Geç never takes progress back.
          const update = taskAfterAnswer(task, isCorrectV, { reopenDone: isOpenEndedExtra(task) });
          if (update) {
            const { data: updated, error: taskUpdateError } = await supabase
              .from("student_tasks")
              .update({ ...update, updated_at: new Date().toISOString() })
              .eq("id", task.id)
              .select("id");
            if (taskUpdateError) throw taskUpdateError;
            if (!updated || updated.length === 0) throw new TaskNotUpdatedError();
            taskCompleted = update.status === "done";
          }
          if (justBound) {
            boundTask = { id: task.id, target: task.total_count, current: update ? update.correct_count : (task.correct_count ?? 0) };
          }
        }
      } catch (e) {
        taskError = taskWriteMessage("submitVocabAnswer(task)", e);
      }
    }

    revalidatePath("/student/ingilizce-quiz");
    revalidatePath("/student");
    return { ok: true, isMastered: next.becameMastered, firstCorrect: next.firstCorrect, taskCompleted, nextCount: next.correctCount, taskError, boundTask };
  } catch (e) {
    return { ok: false, error: vocabActionError("submitVocabAnswer", e) };
  }
}

// The END of a quiz run (the summary screen, or a unit with nothing left to learn): the task becomes Yapıldı when its word target was reached,
// when it has no target (the run itself is the task), or when every word of the unit is already learned so the target could never be reached.
// Otherwise it stays Yarım Yapıldı. Never throws -- the quiz shows the outcome either way.
export async function completeVocabQuizRun(taskId: string, unitNumber: number): Promise<CompleteRunResult> {
  try {
    const taskIdV = parseInput(uuidSchema, taskId);
    const unitV = parseInput(unitNumberSchema, unitNumber);
    const { supabase, userId } = await requireUserId();
    const { data: task, error: taskError } = await supabase
      .from("student_tasks")
      .select("student_id, total_count, correct_count, status, task_type")
      .eq("id", taskIdV)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.student_id !== userId || task.task_type !== "vocab_quiz") return { ok: true, status: "unchanged" };
    if (task.status === "done") return { ok: true, status: "unchanged" };

    // Words of the unit the student has not learned yet (3 correct answers in total).
    let remaining = 1;
    if (task.total_count !== null) {
      const { data: words, error: wordsError } = await supabase.from("lgs_words").select("id").eq("unit_number", unitV);
      if (wordsError) throw wordsError;
      const ids = (words ?? []).map((w) => w.id as string);
      if (ids.length === 0) {
        remaining = 1; // a unit with no words at all is not "everything learned" -- nothing here can finish the task
      } else {
        const { data: mastered, error: progressError } = await supabase
          .from("student_word_progress")
          .select("word_id")
          .eq("student_id", userId)
          .eq("is_mastered", true)
          .in("word_id", ids);
        if (progressError) throw progressError;
        remaining = ids.length - (mastered ?? []).length;
      }
    }

    const update = taskAfterRun(task, remaining);
    if (!update) return { ok: true, status: "unchanged" };
    const { data: updated, error } = await supabase
      .from("student_tasks")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", taskIdV)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) throw new TaskNotUpdatedError();
    revalidatePath("/student/ingilizce-quiz");
    revalidatePath("/student");
    return { ok: true, status: "done" };
  } catch (e) {
    return { ok: false, error: taskWriteMessage("completeVocabQuizRun", e) };
  }
}

// "Yapılmadı": the student's one manual choice for this task type -- an explicit "not doing it", with or without ever starting the quiz.
// (Yapıldı / Yarım Yapıldı are the quiz's to set, never the student's; a task that is already Yapıldı is not taken back.) Progress already made
// stays; answering again later makes it Yarım Yapıldı again.
export async function markVocabQuizNotDone(taskId: string): Promise<NotDoneResult> {
  try {
    const taskIdV = parseInput(uuidSchema, taskId);
    const { supabase, userId } = await requireUserId();
    const { data: task, error: taskError } = await supabase
      .from("student_tasks")
      .select("student_id, task_type, status")
      .eq("id", taskIdV)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.student_id !== userId || task.task_type !== "vocab_quiz") return { ok: false, error: "Görev bulunamadı." };
    if (task.status === "done") return { ok: false, error: "Tamamlanan bir görev Yapılmadı olarak işaretlenemez." };
    if (task.status === "not_done") return { ok: true };
    const { data: updated, error } = await supabase
      .from("student_tasks")
      .update({ status: "not_done", completed: false, updated_at: new Date().toISOString() })
      .eq("id", taskIdV)
      .eq("student_id", userId)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) throw new TaskNotUpdatedError();
    revalidatePath("/student");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: taskWriteMessage("markVocabQuizNotDone", e) };
  }
}
