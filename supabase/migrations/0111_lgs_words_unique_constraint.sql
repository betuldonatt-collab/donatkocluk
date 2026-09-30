-- lgs_words (0108) was created with NO unique constraint at all -- the
-- "syntax error at or near ON" from a prior `ON CONFLICT (english_word) DO
-- NOTHING` insert wasn't actually about the constraint (a missing-constraint
-- case reports a DIFFERENT, clearer error: "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification"), but ON CONFLICT
-- cannot work AT ALL here until a real unique constraint exists to target,
-- so this is needed either way.
--
-- Composite on (unit_number, english_word), not english_word alone: two
-- different units could legitimately reuse the same English word later in
-- the curriculum (a word re-taught with a broader meaning), and a bare
-- english_word unique constraint would incorrectly block that. Scoping to
-- the unit is what actually matches "don't insert the same Unit N word
-- twice."
-- Idempotent: safe to run more than once.

alter table public.lgs_words
  add constraint lgs_words_unit_word_unique unique (unit_number, english_word);

notify pgrst, 'reload schema';

-- Verification: expect true.
select exists (
  select 1 from pg_constraint
  where conrelid = 'public.lgs_words'::regclass and conname = 'lgs_words_unit_word_unique'
) as lgs_words_unique_constraint_exists;
