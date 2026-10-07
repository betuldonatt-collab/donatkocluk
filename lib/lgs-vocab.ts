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

// A word is mastered once it has been answered correctly this many times IN TOTAL (student_word_progress.correct_count, never
// reduced by a miss) -- shared so the quiz UI's own per-word dots always render exactly this many levels, and the server's own
// mastery check (submitVocabAnswer, app/student/ingilizce-quiz/actions.ts) can never drift from what the dots promise.
// (It used to be 3 correct answers IN A ROW; a miss reset the streak and the student saw no progress until the third.)
export const WORD_MASTERY_COUNT = 3;

// One row per (student, word). correct_count is the number of correct answers ever given (the three mastery tiers and the
// "words started" progress counter read it: a word with >= 1 counts as started, once and for good); correct_streak is the
// current run of correct answers, kept for the record. is_mastered is application logic (correct_count >= 3), not enforced at
// the DB level.
export type StudentWordProgress = {
  id: string;
  student_id: string;
  word_id: string;
  correct_count: number;
  correct_streak: number;
  is_mastered: boolean;
  last_tested_at: string | null;
};

// 0 = never answered correctly, 1 = light, 2 = medium, 3 = mastered (3 or more correct answers).
export function masteryLevel(correctCount: number): 0 | 1 | 2 | 3 {
  if (correctCount >= WORD_MASTERY_COUNT) return 3;
  return correctCount >= 2 ? 2 : correctCount >= 1 ? 1 : 0;
}

// What one answer does to a word's progress -- the single rule behind submitVocabAnswer. A correct answer adds one to
// correct_count and extends the streak; a miss (or a "Pas Geç") leaves correct_count exactly as it was -- nothing already
// earned is taken back -- and only resets the streak. `firstCorrect`: this answer is the word's first correct one ever (the
// "words started" counter moves exactly then and never again for the same word); `becameMastered`: it crossed the 3rd.
export function nextWordProgress(
  previous: { correctCount: number; correctStreak: number },
  isCorrect: boolean,
): { correctCount: number; correctStreak: number; isMastered: boolean; firstCorrect: boolean; becameMastered: boolean } {
  const correctCount = previous.correctCount + (isCorrect ? 1 : 0);
  return {
    correctCount,
    correctStreak: isCorrect ? previous.correctStreak + 1 : 0,
    isMastered: correctCount >= WORD_MASTERY_COUNT,
    firstCorrect: isCorrect && previous.correctCount === 0,
    becameMastered: isCorrect && previous.correctCount < WORD_MASTERY_COUNT && correctCount >= WORD_MASTERY_COUNT,
  };
}

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
// lowercased with plain toLowerCase() gets İ/I wrong the other way. Hyphens
// are stripped outright (not replaced with a space) rather than compared --
// a compound word's hyphen ("well-known", "x-ray") is easy to drop by
// accident, and the source data itself sometimes carries one, so stripping
// it on BOTH sides means a student typing it either way always matches.
function normalizeForDirection(s: string, direction: QuizDirection): string {
  return s
    .trim()
    .toLocaleLowerCase(direction === "tr_to_en" ? "en-US" : "tr-TR")
    .replace(/-/g, "");
}

// Some lgs_words rows record more than one acceptable meaning for the same
// word, slash-separated ("çekici/büyüleyici") -- the student only has to
// land on ONE of them, not reproduce the whole slash-joined string. Applies
// to whichever side is being checked against (normally turkish_meaning, for
// en_to_tr; harmless no-op for a plain single-meaning answer either way).
function acceptedVariants(correctAnswer: string): string[] {
  return correctAnswer
    .split("/")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// EXACT_MATCH beats a typo check outright, and is checked against every
// accepted variant (see acceptedVariants above), not just the raw
// slash-joined string. ACCEPTED_TYPO only ever applies typing English
// (tr_to_en) and only for a variant over 4 letters, at edit distance <= 1 --
// short words have too little room for a 1-character difference to still
// clearly mean the same word. Deliberately NOT extended to en_to_tr: Turkish
// is the student's native language, so a 1-edit "typo" there is more likely
// to actually be a different, wrong word than it would be for a foreign
// word the student is still learning to spell.
export function checkVocabAnswer(userAnswer: string, correctAnswer: string, direction: QuizDirection): AnswerResult {
  const a = normalizeForDirection(userAnswer, direction);
  const variants = acceptedVariants(correctAnswer).map((v) => normalizeForDirection(v, direction));
  if (variants.length === 0) return "INCORRECT";

  if (variants.includes(a)) return "EXACT_MATCH";
  if (direction === "tr_to_en" && variants.some((v) => v.length > 4 && levenshteinDistance(a, v) <= 1)) {
    return "ACCEPTED_TYPO";
  }
  return "INCORRECT";
}

// --- Phase 2: quiz batch selection -----------------------------------------

// correctCount rides along so the quiz session's own per-word level dots can show where a word already stands (0 up to
// WORD_MASTERY_COUNT - 1 -- selectQuizBatch below already drops anything mastered) the instant its prompt appears, not just
// after the student's next answer.
export type QuizWord = Pick<LgsWord, "id" | "english_word" | "turkish_meaning"> & { correctCount: number };
export type WordProgressSummary = Pick<StudentWordProgress, "correct_count" | "is_mastered" | "last_tested_at">;

// Uniform Fisher-Yates shuffle (a new array; `rng` is injectable for tests).
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pure selection logic behind getVocabQuizBatch (app/student/ingilizce-quiz/actions.ts) -- kept separate from the Supabase
// calls so it can be tested directly. Drops mastered words, then takes up to `limit` of the rest in a completely random order:
// the words are never presented in the list's own (sequential) order, and a fresh batch is a fresh shuffle.
export function selectQuizBatch(
  words: Pick<LgsWord, "id" | "english_word" | "turkish_meaning">[],
  progressByWordId: Map<string, WordProgressSummary>,
  limit: number,
  rng: () => number = Math.random,
): QuizWord[] {
  const open = words
    .map((w) => ({ word: w, progress: progressByWordId.get(w.id) }))
    .filter(({ progress }) => !progress?.is_mastered);
  return shuffled(open, rng)
    .slice(0, limit)
    .map(({ word, progress }) => ({
      id: word.id,
      english_word: word.english_word,
      turkish_meaning: word.turkish_meaning,
      correctCount: progress?.correct_count ?? 0,
    }));
}

// A word answered wrongly (or skipped with Pas Geç) -- whatever it had earned before -- comes back later in the same session:
// a copy is queued `gap` words after the current one (or at the very end when fewer remain). Returns the new queue; the
// original word stays where it was asked. Never queues a second copy while one is already waiting further down.
export function requeueAfterMiss<T extends { id: string }>(queue: readonly T[], currentIndex: number, missed: T, gap = 3): T[] {
  if (queue.slice(currentIndex + 1).some((w) => w.id === missed.id)) return [...queue];
  const at = Math.min(currentIndex + 1 + gap, queue.length);
  return [...queue.slice(0, at), missed, ...queue.slice(at)];
}

// --- Phase 2: dashboard mastery stats ---------------------------------------

// total: the unit's words. mastered: words with 3 or more correct answers. level1 / level2: words with exactly 1 / exactly 2.
// "Started" (the progress counter, xx/xxx) is every word with at least one correct answer: level1 + level2 + mastered.
export type UnitStat = { unitNumber: number; total: number; mastered: number; level1: number; level2: number };

export function unitStarted(stat: UnitStat): number {
  return stat.level1 + stat.level2 + stat.mastered;
}

// The unit card's own numbers after one more correct answer moved a word from `previousCount` to `nextCount` correct answers
// -- so the dashboard is right the moment the student exits the quiz, without a reload. A word's first correct answer is the
// only one that raises the started counter; later ones only move it between tiers.
export function applyCorrectToUnitStat(stat: UnitStat, previousCount: number, nextCount: number): UnitStat {
  const tiers = { level1: stat.level1, level2: stat.level2, mastered: stat.mastered };
  const key = (c: number) => (c >= WORD_MASTERY_COUNT ? "mastered" : c === 2 ? "level2" : c === 1 ? "level1" : null);
  const from = key(previousCount);
  const to = key(nextCount);
  if (from === to) return stat;
  if (from) tiers[from] -= 1;
  if (to) tiers[to] += 1;
  return { ...stat, ...tiers };
}

// Fills in units 1-10 always all present (even at 0/0 for a unit with no
// words loaded yet), in order -- from the ALREADY-AGGREGATED per-unit rows
// returned by the get_lgs_vocab_unit_stats RPC (one row per unit that has
// >= 1 word), rather than summing every individual word row here. lgs_words
// can easily exceed PostgREST's default per-request row cap (1000) once
// every unit is fully populated -- fetching every row to count them
// client-side silently truncated this dashboard's totals once the table
// passed that cap (units 1-4 alone already total 900+ words); aggregating
// in SQL means this page never needs more than 10 rows back, no matter how
// large the word bank grows.
export function fillUnitStats(rows: UnitStat[]): UnitStat[] {
  const stats = new Map<number, UnitStat>();
  for (let unit = 1; unit <= 10; unit++) stats.set(unit, { unitNumber: unit, total: 0, mastered: 0, level1: 0, level2: 0 });
  for (const r of rows) {
    if (stats.has(r.unitNumber)) stats.set(r.unitNumber, r);
  }
  return [...stats.values()];
}
