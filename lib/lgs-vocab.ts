// LGS English Vocabulary Quiz. Phase 1 added the types below, mirroring
// supabase/migrations/0108_lgs_vocab_quiz.sql exactly. This app has no
// generated database.types.ts (every feature hand-writes its own row types
// next to where it's used, e.g. DetailTask/StudentTask), so these follow
// that same convention instead of introducing a generated-types file on
// their own. Phase 2 (below) adds the pure quiz logic shared by the
// student's own server actions (app/student/ingilizce-quiz/actions.ts) and
// its UI -- nothing here touches Supabase directly, so all of it is
// unit-testable without a mocked client.

// The master word list -- shared reference data, not scoped to one
// student or cohort.
export type LgsWord = {
  id: string;
  unit_number: number; // 1-10, enforced by the DB check constraint
  english_word: string;
  turkish_meaning: string;
  created_at: string;
};

// The 10 official LGS İngilizce unit titles, index-matched to unit_number
// (1-10) -- shown on the quiz dashboard/session cards so the student
// always knows which unit's vocabulary they're studying, not just its
// number. A fixed, hand-curated list rather than pulled from lib/curriculum
// (whose lgs-ingilizce course names these units too, but as bare "Unit N:
// ..." with no "Ünite" prefix): the vocab quiz's own lgs_words table is
// intentionally independent of the curriculum module, and the coach asked
// for this exact wording.
const VOCAB_UNIT_TITLES = [
  "1. Ünite: Friendship",
  "2. Ünite: Teen Life",
  "3. Ünite: In the Kitchen",
  "4. Ünite: On the Phone",
  "5. Ünite: The Internet",
  "6. Ünite: Adventures",
  "7. Ünite: Tourism",
  "8. Ünite: Chores",
  "9. Ünite: Science",
  "10. Ünite: Natural Forces",
];

// Falls back to a bare "N. Ünite" for a number outside 1-10, which should
// never happen (every caller's own unit picker is already capped there)
// but keeps this a safe, crash-proof lookup regardless.
export function vocabUnitTitle(unitNumber: number): string {
  return VOCAB_UNIT_TITLES[unitNumber - 1] ?? `${unitNumber}. Ünite`;
}

// One row per (student, word) -- a simple spaced-repetition streak.
// is_mastered flips to true once correct_streak reaches 3; that transition
// is application logic (a later phase's server action), not enforced at
// the DB level.
export type StudentWordProgress = {
  id: string;
  student_id: string;
  word_id: string;
  correct_streak: number;
  is_mastered: boolean;
  last_tested_at: string | null;
};

// --- Phase 2: answer checking (Levenshtein-tolerant typo forgiveness) ------

// Classic O(n*m) edit-distance DP -- words here are at most a few dozen
// characters, so this is instant; no need for the space-optimized
// two-row version.
export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

export type AnswerResult = "EXACT_MATCH" | "ACCEPTED_TYPO" | "INCORRECT";

// Which language the STUDENT is typing this question's answer in -- not
// which language is shown as the prompt. "tr_to_en": the prompt is
// Turkish, the student types the English word (typo-tolerant, per the
// coach's request). "en_to_tr": the prompt is English, the student types
// the Turkish meaning (exact match only -- forgiving Turkish spelling
// wasn't asked for, and could mask an actual wrong answer more easily
// than it would for a foreign-language answer).
export type QuizDirection = "en_to_tr" | "tr_to_en";

// Case-insensitive per side, using the RIGHT locale for whichever
// language `correctAnswer` actually is -- English text lowercased with
// "tr-TR" gets the Turkish dotless-I rule wrong (a mobile keyboard's
// auto-capitalized "Item" would wrongly become "ıtem"), and Turkish text
// lowercased with plain toLowerCase() gets İ/I wrong the other way.
function normalizeForDirection(s: string, direction: QuizDirection): string {
  return s.trim().toLocaleLowerCase(direction === "tr_to_en" ? "en-US" : "tr-TR");
}

// EXACT_MATCH beats a typo check outright. ACCEPTED_TYPO only ever applies
// typing English (tr_to_en) and only for words over 4 letters, at edit
// distance <= 1 -- short words have too little room for a 1-character
// difference to still clearly mean the same word.
export function checkVocabAnswer(userAnswer: string, correctAnswer: string, direction: QuizDirection): AnswerResult {
  const a = normalizeForDirection(userAnswer, direction);
  const b = normalizeForDirection(correctAnswer, direction);
  if (a === b) return "EXACT_MATCH";
  if (direction === "tr_to_en" && b.length > 4 && levenshteinDistance(a, b) <= 1) return "ACCEPTED_TYPO";
  return "INCORRECT";
}

// --- Phase 2: quiz batch selection -----------------------------------------

export type QuizWord = Pick<LgsWord, "id" | "english_word" | "turkish_meaning">;
export type WordProgressSummary = Pick<StudentWordProgress, "correct_streak" | "is_mastered" | "last_tested_at">;

// Pure selection/ordering logic behind getVocabQuizBatch (app/student/
// ingilizce-quiz/actions.ts) -- kept separate from the Supabase calls so it
// can be tested directly. Drops mastered words, then sorts by lowest
// correct_streak first (the words the student struggles with most), and
// within a tied streak, by the longest since last_tested_at (never-tested
// words -- no progress row at all -- sort as if last tested at the epoch,
// so they're practiced before a word tested only slightly less recently).
export function selectQuizBatch(
  words: Pick<LgsWord, "id" | "english_word" | "turkish_meaning">[],
  progressByWordId: Map<string, WordProgressSummary>,
  limit: number,
): QuizWord[] {
  return words
    .map((w) => ({ word: w, progress: progressByWordId.get(w.id) }))
    .filter(({ progress }) => !progress?.is_mastered)
    .sort((x, y) => {
      const streakDiff = (x.progress?.correct_streak ?? 0) - (y.progress?.correct_streak ?? 0);
      if (streakDiff !== 0) return streakDiff;
      const xTime = x.progress?.last_tested_at ? new Date(x.progress.last_tested_at).getTime() : 0;
      const yTime = y.progress?.last_tested_at ? new Date(y.progress.last_tested_at).getTime() : 0;
      return xTime - yTime;
    })
    .slice(0, limit)
    .map(({ word }) => ({ id: word.id, english_word: word.english_word, turkish_meaning: word.turkish_meaning }));
}

// --- Phase 2: dashboard mastery stats ---------------------------------------

export type UnitStat = { unitNumber: number; total: number; mastered: number };

// Pure aggregation behind the "İngilizce Quiz" dashboard's per-unit "15/40
// Öğrenildi" counters -- units 1-10 always all present (even at 0/0 for a
// unit with no words loaded yet), in order.
export function computeUnitStats(words: Pick<LgsWord, "id" | "unit_number">[], masteredWordIds: Set<string>): UnitStat[] {
  const stats = new Map<number, UnitStat>();
  for (let unit = 1; unit <= 10; unit++) stats.set(unit, { unitNumber: unit, total: 0, mastered: 0 });
  for (const w of words) {
    const stat = stats.get(w.unit_number);
    if (!stat) continue; // a unit_number outside 1-10 should never exist (DB check constraint), but never crash the dashboard over it
    stat.total += 1;
    if (masteredWordIds.has(w.id)) stat.mastered += 1;
  }
  return [...stats.values()];
}
