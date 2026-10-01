-- Fixes the İngilizce Quiz dashboard showing wrong/zero word counts for
-- units 5-10: app/student/ingilizce-quiz/page.tsx was fetching EVERY row of
-- lgs_words (select id, unit_number) and summing them client-side. That
-- query has no explicit limit, but PostgREST enforces its own hard
-- server-side row cap (db-max-rows, 1000 by default) that a client cannot
-- override with .range() -- it just silently returns a truncated result set,
-- no error. Units 1-4 alone already total 931 words; once units 5-10 pushed
-- the table past 1000 rows, later units' words stopped coming back at all
-- (or came back partial), so the dashboard's own client-side count was
-- wrong -- not the actual data (a quiz session's own per-unit query was
-- always correct, which is why the words were quizzable even though the
-- dashboard card didn't show them).
--
-- Fix: aggregate in SQL instead of counting rows in JS. This RPC returns at
-- most one row per unit that has >= 1 word (never more than 10 rows,
-- regardless of how many thousands of words exist), with THIS student's own
-- mastered count folded in via a left join scoped to auth.uid() -- so the
-- dashboard never needs to pull a single lgs_words/student_word_progress row
-- to the client just to display a total.
-- Idempotent: safe to run more than once.

create or replace function public.get_lgs_vocab_unit_stats()
returns table (unit_number int, total int, mastered int)
language sql
security definer
set search_path = public
stable
as $$
  select
    w.unit_number,
    count(w.id)::int as total,
    count(swp.id) filter (where swp.is_mastered)::int as mastered
  from public.lgs_words w
  left join public.student_word_progress swp
    on swp.word_id = w.id and swp.student_id = auth.uid()
  group by w.unit_number
  order by w.unit_number;
$$;

grant execute on function public.get_lgs_vocab_unit_stats() to authenticated;

notify pgrst, 'reload schema';

-- Verification: expect true, and the actual per-unit totals (eyeball these
-- against what the dashboard should show -- every unit you've populated
-- should appear here with its real total, not capped at 1000 combined).
select exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_lgs_vocab_unit_stats'
) as rpc_exists;

select unit_number, count(*) as total from public.lgs_words
group by unit_number
order by unit_number;
