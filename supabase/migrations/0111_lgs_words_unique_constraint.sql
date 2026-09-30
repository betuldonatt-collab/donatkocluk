-- lgs_words (0108) has no unique constraint at all -- so ON CONFLICT can't
-- target anything yet, and a plain multi-row INSERT that happens to repeat a
-- word WITHIN one statement, or across separate statements run over several
-- sessions, silently creates duplicate rows instead of being caught.
--
-- Composite on (unit_number, english_word), not english_word alone: MEB's
-- own curriculum reuses common words (accept, add, connect, prefer, ...)
-- across several units on purpose -- a bare english_word unique constraint
-- would incorrectly reject a legitimate second unit's copy of a word the
-- first unit already has. Scoping to the unit is what actually matches
-- "don't insert the same Unit N word twice."
--
-- Written as a guarded DO block (plain `alter table ... add constraint` has
-- no IF NOT EXISTS form) so this migration is safe to run more than once --
-- e.g. if the constraint was already added by hand while this file didn't
-- exist in the repo.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lgs_words'::regclass
      and conname = 'lgs_words_unit_word_unique'
  ) then
    alter table public.lgs_words
      add constraint lgs_words_unit_word_unique unique (unit_number, english_word);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verification: expect true.
select exists (
  select 1 from pg_constraint
  where conrelid = 'public.lgs_words'::regclass and conname = 'lgs_words_unit_word_unique'
) as lgs_words_unique_constraint_exists;
