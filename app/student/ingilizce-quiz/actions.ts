"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { computeAutoTaskStatus } from "@/lib/count-fields";
import { GENERIC_DB_ERROR } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { nextWordProgress, selectQuizBatch, type QuizWord, type WordProgressSummary } from "@/lib/lgs-vocab";

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
function vocabActionError(label: string, e: unknown): string {
  console.error(`[${label}] failed:`, e);
  Sentry.captureException(e);
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : null;
  if (code) return `Kelime ilerlemesi kaydedilemedi (hata kodu: ${code}).`;
  return e instanceof Error ? e.message : GENERIC_DB_ERROR;
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
// nextCount is this word's own correct_count AFTER this answer (unchanged on a miss/skip -- nothing already earned is taken
// back) -- the quiz session's per-word level dots and the dashboard's tier counters render straight off it, authoritative over
// whatever they optimistically guessed the instant the answer was given. isMastered / firstCorrect say whether THIS answer
// crossed the 3rd correct answer / was the word's very first correct one. taskCompleted is the same idea for an assigned
// vocab_quiz task's own word-count target (see activeTaskId below).
type SubmitAnswerResult =
  | { ok: true; isMastered: boolean; firstCorrect: boolean; taskCompleted: boolean; nextCount: number }
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

export type ActiveVocabQuizTask = { id: string; target: number; current: number };

// The one coach-assigned "N. Ünite - M Kelime" task (if any) still open for
// this unit -- Ders Atama (task-form-fields.tsx) stores it as task_type
// 'vocab_quiz', course_id "ingilizce-quiz", topic_id the Ünite number as
// plain text, total_count the word-count target. Not started/mastered by
// the coach at all beyond that: correct_count climbs by one per correct
// quiz answer (submitVocabAnswer below) until it reaches total_count, at
// which point the task is marked done and stops showing up here.
export async function getActiveVocabQuizTask(unitNumber: number): Promise<GetActiveVocabQuizTaskResult> {
  try {
    const unitV = parseInput(unitNumberSchema, unitNumber);
    const { supabase, userId } = await requireUserIdReadOnly();
    const { data, error } = await supabase
      .from("student_tasks")
      .select("id, total_count, correct_count")
      .eq("student_id", userId)
      .eq("task_type", "vocab_quiz")
      .eq("topic_id", String(unitV))
      .neq("status", "done")
      .not("total_count", "is", null)
      .order("task_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.total_count === null) return { ok: true, task: null };
    return { ok: true, task: { id: data.id, target: data.total_count, current: data.correct_count ?? 0 } };
  } catch (e) {
    return { ok: false, error: vocabActionError("getActiveVocabQuizTask", e) };
  }
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
// reaches its target, same computeAutoTaskStatus every other count-driven
// task type already uses -- an LGS vocab_quiz task is exempted from the
// Kanıt Fotoğrafı/evidence-hold gate entirely (lgsCompletionProblem), so
// this can set status/completed directly with no extra approval step.
export async function submitVocabAnswer(
  wordId: string,
  isCorrect: boolean,
  activeTaskId?: string | null,
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
    if (isCorrectV && activeTaskId) {
      const activeTaskIdV = parseInput(uuidSchema, activeTaskId);
      const { data: task, error: taskFetchError } = await supabase
        .from("student_tasks")
        .select("student_id, total_count, correct_count, status")
        .eq("id", activeTaskIdV)
        .maybeSingle();
      if (taskFetchError) throw taskFetchError;
      // Silently skipped, not an error: the task may have been completed
      // or removed by the coach between this batch loading and this
      // answer -- the word's own streak above is already saved either way.
      if (task && task.student_id === userId && task.total_count !== null && task.status !== "done") {
        const nextCorrect = Math.min((task.correct_count ?? 0) + 1, task.total_count);
        const status = computeAutoTaskStatus(task.total_count, nextCorrect, 0, 0);
        taskCompleted = status === "done";
        const { error: taskUpdateError } = await supabase
          .from("student_tasks")
          .update({
            correct_count: nextCorrect,
            status: status ?? task.status,
            completed: taskCompleted,
            updated_at: new Date().toISOString(),
          })
          .eq("id", activeTaskIdV);
        if (taskUpdateError) throw taskUpdateError;
      }
    }

    revalidatePath("/student/ingilizce-quiz");
    revalidatePath("/student");
    return { ok: true, isMastered: next.becameMastered, firstCorrect: next.firstCorrect, taskCompleted, nextCount: next.correctCount };
  } catch (e) {
    return { ok: false, error: vocabActionError("submitVocabAnswer", e) };
  }
}
