"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { selectQuizBatch, type QuizWord, type WordProgressSummary } from "@/lib/lgs-vocab";

// Writes return their outcome instead of throwing (same convention as
// app/student/paragraf-problem/lgs-actions.ts's SaveResult) -- a thrown
// message is stripped to a generic one once it crosses the Server Action
// boundary in a production build. Reads (getVocabQuizBatch below) throw
// directly, same as that file's own getMoreLgsEntries -- the caller wraps
// them in its own try/catch when it needs a friendly message instead.
// isMastered on success tells the UI whether THIS answer was the one that
// crossed the streak-of-3 threshold, so the dashboard's mastered count can
// bump exactly once, right when it actually happens -- not on every
// correct answer.
type SubmitAnswerResult = { ok: true; isMastered: boolean } | { ok: false; error: string };

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

// Up to `limit` not-yet-mastered words for this unit, prioritized by
// lowest correct_streak then longest since last tested (selectQuizBatch,
// lib/lgs-vocab.ts). Two plain queries instead of one join: lgs_words has
// no per-student scoping to push down, and a left-join-with-null-or-false
// filter across two tables isn't a single clean PostgREST filter, while
// this is a handful of rows either way (a unit's word list is small).
export async function getVocabQuizBatch(unitNumber: number, limit = 10): Promise<QuizWord[]> {
  const unitV = parseInput(unitNumberSchema, unitNumber);
  const limitV = parseInput(batchLimitSchema, limit);
  const { supabase, userId } = await requireUserIdReadOnly();

  const { data: words, error: wordsError } = await supabase
    .from("lgs_words")
    .select("id, english_word, turkish_meaning")
    .eq("unit_number", unitV);
  if (wordsError) throw dbError(wordsError);
  if (!words || words.length === 0) return [];

  const wordIds = words.map((w) => w.id);
  const { data: progressRows, error: progressError } = await supabase
    .from("student_word_progress")
    .select("word_id, correct_streak, is_mastered, last_tested_at")
    .eq("student_id", userId)
    .in("word_id", wordIds);
  if (progressError) throw dbError(progressError);

  const progressByWordId = new Map<string, WordProgressSummary>(
    (progressRows ?? []).map((p) => [
      p.word_id,
      { correct_streak: p.correct_streak, is_mastered: p.is_mastered, last_tested_at: p.last_tested_at },
    ]),
  );
  return selectQuizBatch(words, progressByWordId, limitV);
}

// Upserts this student's streak for one word: correct extends it by one
// (mastered once it reaches 3), incorrect resets it to 0. last_tested_at
// always moves to now, whichever way it went -- both feed selectQuizBatch's
// own prioritization on the NEXT batch fetch.
export async function submitVocabAnswer(wordId: string, isCorrect: boolean): Promise<SubmitAnswerResult> {
  try {
    const wordIdV = parseInput(uuidSchema, wordId);
    const isCorrectV = parseInput(z.boolean(), isCorrect);
    const { supabase, userId } = await requireUserId();

    const { data: existing, error: fetchError } = await supabase
      .from("student_word_progress")
      .select("correct_streak")
      .eq("student_id", userId)
      .eq("word_id", wordIdV)
      .maybeSingle();
    if (fetchError) throw dbError(fetchError);

    const nextStreak = isCorrectV ? (existing?.correct_streak ?? 0) + 1 : 0;
    const isMastered = nextStreak >= 3;
    const { error } = await supabase.from("student_word_progress").upsert(
      {
        student_id: userId,
        word_id: wordIdV,
        correct_streak: nextStreak,
        is_mastered: isMastered,
        last_tested_at: new Date().toISOString(),
      },
      { onConflict: "student_id,word_id" },
    );
    if (error) throw dbError(error);

    revalidatePath("/student/ingilizce-quiz");
    return { ok: true, isMastered };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}
