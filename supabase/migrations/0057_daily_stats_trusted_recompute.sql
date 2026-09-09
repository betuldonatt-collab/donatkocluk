-- Security audit finding (Critical): student_daily_stats_own was a FOR
-- ALL policy scoped only to student_id = auth.uid() -- no field-level
-- validation, no upper bound, no D+Y+B=Toplam consistency check. Since
-- this table is meant to be a derived cache (recomputed from student_
-- tasks, never hand-entered by a student), that RLS grant let a student
-- bypass the entire app and write arbitrary totals directly via the
-- Supabase client, defeating every Zod/countsAreConsistent guard built
-- for student_tasks. This migration makes the table read-only for
-- students and moves the one legitimate student-side write (recompute
-- from their own real task data) into a security definer function that
-- resolves auth.uid() internally -- the student can no longer supply
-- the numbers themselves, only trigger a trusted recompute.
--
-- The coach's own manual override (overrideStudentDailyStats,
-- app/coach/actions.ts, RLS: student_daily_stats_coach_override) is
-- deliberately left untouched -- it's an intentional, already-validated
-- (overrideStatsSchema + countsAreConsistent + requireCoachAccess)
-- correction feature for a trusted actor, not the vulnerability here.

drop policy "student_daily_stats_own" on public.student_daily_stats;

create policy "student_daily_stats_own_read" on public.student_daily_stats for select
  to authenticated
  using (student_id = (select auth.uid()));

-- Single atomic aggregate + upsert (was: fetch every task for the day,
-- sum in JS, then upsert -- two round-trips from app/student/actions.ts's
-- recomputeDailyStats). student_id is never a parameter -- always
-- auth.uid() -- so there is no way to pass someone else's id even by
-- calling this function directly.
create function public.recompute_student_daily_stats(p_entry_date date)
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
  where student_id = auth.uid() and task_date = p_entry_date
  on conflict (student_id, entry_date) do update set
    total_count = excluded.total_count,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    empty_count = excluded.empty_count,
    updated_at = now()
  returning *;
$$;

grant execute on function public.recompute_student_daily_stats(date) to authenticated;

notify pgrst, 'reload schema';
