-- Data-consistency audit finding: recompute_student_daily_stats (0057)
-- sums total_count/correct_count/wrong_count/empty_count across EVERY
-- task on a date, with no status filter at all -- unlike its sibling
-- rollup, recompute_student_topic_stats (0072), which has always required
-- `status in ('done', 'half_done')`. A pending task carrying a coach-set
-- target (total_count set, correct/wrong/empty still null) was silently
-- inflating "Toplam Soru" on the coach's Bugün/Bu Hafta card
-- (daily-stats-summary.tsx) and the parent's "Bu Hafta Toplam Çözülen
-- Soru" card (weekly-stats-summary.tsx) -- both read straight from this
-- table -- while Doğru/Yanlış/Boş stayed correctly at 0, producing a
-- Toplam that didn't match its own D+Y+B breakdown for a day/week with
-- any unstarted assigned work. The student's own equivalent card
-- (totals-summary.tsx) had already been moved off this table entirely for
-- a related reason (see its own comment) -- this migration instead fixes
-- the shared source function itself, so every remaining reader of
-- student_daily_stats is correct by construction rather than needing its
-- own workaround.
--
-- Same status filter as recompute_student_topic_stats, nothing else
-- changes -- the coach's own manual override (overrideStudentDailyStats)
-- is untouched, it writes directly, never through this function.
create or replace function public.recompute_student_daily_stats(p_entry_date date)
returns public.student_daily_stats
language sql
security definer
set search_path = public
volatile
as $$
  insert into public.student_daily_stats (student_id, entry_date, total_count, correct_count, wrong_count, empty_count)
  select
    auth.uid(),
    p_entry_date,
    coalesce(sum(total_count), 0),
    coalesce(sum(correct_count), 0),
    coalesce(sum(wrong_count), 0),
    coalesce(sum(empty_count), 0)
  from public.student_tasks
  where student_id = auth.uid()
    and task_date = p_entry_date
    and status in ('done', 'half_done')
  on conflict (student_id, entry_date) do update set
    total_count = excluded.total_count,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    empty_count = excluded.empty_count,
    updated_at = now()
  returning *;
$$;

-- Backfill: every EXISTING student_daily_stats row was written by the old,
-- unfiltered version of this function, so already-cached rows for the
-- current week (what's actually on screen right now) still hold stale,
-- possibly-inflated totals until something happens to re-trigger a
-- recompute for that exact date. Two passes, not one UPDATE...FROM, since
-- a plain join would silently skip any (student, date) with ZERO
-- done/half_done tasks -- a row that needs to become 0, not be left alone.

-- Pass 1: dates with at least one done/half_done task -- recompute to the
-- correct filtered sum.
update public.student_daily_stats sds
set
  total_count = agg.total_count,
  correct_count = agg.correct_count,
  wrong_count = agg.wrong_count,
  empty_count = agg.empty_count,
  updated_at = now()
from (
  select
    student_id,
    task_date as entry_date,
    coalesce(sum(total_count), 0) as total_count,
    coalesce(sum(correct_count), 0) as correct_count,
    coalesce(sum(wrong_count), 0) as wrong_count,
    coalesce(sum(empty_count), 0) as empty_count
  from public.student_tasks
  where status in ('done', 'half_done')
  group by student_id, task_date
) agg
where sds.student_id = agg.student_id and sds.entry_date = agg.entry_date;

-- Pass 2: dates with NO done/half_done task at all (every task that day
-- is pending/not_done) -- zero out any stale nonzero cache row rather
-- than leaving it standing for a date that now has nothing to show.
update public.student_daily_stats sds
set total_count = 0, correct_count = 0, wrong_count = 0, empty_count = 0, updated_at = now()
where (sds.total_count != 0 or sds.correct_count != 0 or sds.wrong_count != 0 or sds.empty_count != 0)
  and not exists (
    select 1 from public.student_tasks st
    where st.student_id = sds.student_id and st.task_date = sds.entry_date and st.status in ('done', 'half_done')
  );

notify pgrst, 'reload schema';
