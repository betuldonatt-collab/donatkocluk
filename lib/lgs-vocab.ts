// LGS English Vocabulary Quiz, Phase 1: types only, mirroring
// supabase/migrations/0108_lgs_vocab_quiz.sql exactly. No server actions or
// UI yet -- those are later phases. This app has no generated
// database.types.ts (every feature hand-writes its own row types next to
// where it's used, e.g. DetailTask/StudentTask), so these follow that same
// convention instead of introducing a generated-types file on their own.

// The master word list -- shared reference data, not scoped to one
// student or cohort.
export type LgsWord = {
  id: string;
  unit_number: number; // 1-10, enforced by the DB check constraint
  english_word: string;
  turkish_meaning: string;
  created_at: string;
};

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
