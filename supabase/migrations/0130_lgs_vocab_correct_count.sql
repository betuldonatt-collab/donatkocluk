-- LGS İngilizce Kelime Quizi: progress that shows from the FIRST correct answer.
--
-- Until now a word's progress was its correct_streak (answers right IN A ROW) and it was "learned" at 3 in a row; a single miss
-- reset it to 0, so a student saw nothing happen until a word had been answered right three times without a slip. The quiz now
-- counts correct answers IN TOTAL:
--   * correct_count (new) = how many times the word has been answered correctly, ever. A miss never reduces it.
--   * The unit progress counter (xx/xxx) = words with correct_count >= 1 -- it moves on a word's first correct answer, once.
--   * Three tiers per word: 1 correct = light, 2 = medium, 3 or more = mastered (is_mastered, which the quiz stops asking).
-- correct_streak stays as it is (the current run) and is still kept up to date by the app.
--
-- BACKFILL. Old rows only knew the current streak, not the answers given before a miss, so correct_count starts at
-- greatest(correct_streak, 3 if is_mastered else 0): every word a student had mastered stays mastered, and every word on a running
-- streak keeps it. A word that had earned correct answers and then been missed (streak back at 0) cannot be recovered and
-- starts again from 0 -- it counts as "started" again with its next correct answer.
--
-- RPC. get_lgs_vocab_unit_stats now also returns level1 / level2 (words with exactly 1 / 2 correct answers) and counts "mastered"
-- as correct_count >= 3; its result shape changes, so it is dropped and recreated.
--
-- Run it right after the new version is deployed: until it has run, saving an answer in the quiz fails (the new column does not
-- exist yet) and the dashboard falls back to empty counters. Idempotent: safe to run more than once.
-- Rollback: drop the new function and recreate the old one from 0112; alter table public.student_word_progress drop column correct_count;

alter table public.student_word_progress
  add column if not exists correct_count int not null default 0 check (correct_count >= 0);

update public.student_word_progress
set correct_count = greatest(correct_streak, case when is_mastered then 3 else 0 end)
where correct_count = 0 and (correct_streak > 0 or is_mastered);

drop function if exists public.get_lgs_vocab_unit_stats();

create function public.get_lgs_vocab_unit_stats()
returns table (unit_number int, total int, mastered int, level1 int, level2 int)
language sql
security definer
set search_path = public
stable
as $$
  select
    w.unit_number,
    count(w.id)::int as total,
    count(swp.id) filter (where swp.correct_count >= 3)::int as mastered,
    count(swp.id) filter (where swp.correct_count = 1)::int as level1,
    count(swp.id) filter (where swp.correct_count = 2)::int as level2
  from public.lgs_words w
  left join public.student_word_progress swp
    on swp.word_id = w.id and swp.student_id = auth.uid()
  group by w.unit_number
  order by w.unit_number;
$$;

grant execute on function public.get_lgs_vocab_unit_stats() to authenticated;

notify pgrst, 'reload schema';

-- Verification: expect true, true, and no row where a mastered word has fewer than 3 correct answers.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_word_progress' and column_name = 'correct_count'
  ) as correct_count_column_exists,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_lgs_vocab_unit_stats'
  ) as rpc_exists,
  (select count(*) from public.student_word_progress where is_mastered and correct_count < 3) as mastered_rows_below_three;
