-- Kronometre Yarışması: shift the "daily" boundary to 02:00 Turkey time
-- (UTC+3, no DST) instead of literal UTC midnight, and surface yesterday's
-- winner so a student who fell asleep before the reset can still see who
-- won.
--
-- Every date in this app is computed as a UTC calendar date, by consistent
-- convention (lib/date.ts, every prior stopwatch migration) -- so "today"
-- currently rolls over at UTC 00:00. 02:00 Turkey time is UTC 23:00 (of
-- the preceding UTC calendar day), so the boundary is reached by shifting
-- the clock forward 1 hour before taking the date: at UTC 22:59 that's
-- still 23:59 the same UTC day (unchanged date, boundary not yet
-- crossed); at UTC 23:01 that's 00:01 the NEXT UTC day (date advances,
-- boundary crossed). This exact shift is mirrored in JS by
-- stopwatchLogicalDateIso (lib/date.ts), used by the coach's own
-- fetchStopwatchCompetitionRoster (app/coach/actions.ts) so the two
-- surfaces never disagree about what "today" means.
--
-- Two new OUT columns (yesterday_winner_*) change this function's return
-- row type, which plain CREATE OR REPLACE refuses (Postgres error 42P13:
-- "cannot change return type of existing function") -- it has to be
-- dropped first. No view or other function depends on it (checked), so
-- this is safe.
drop function if exists public.get_daily_stopwatch_ranking();

create function public.get_daily_stopwatch_ranking()
returns table (
  my_rank int,
  my_total_minutes int,
  top_student_name text,
  top_student_total_minutes int,
  participant_count int,
  yesterday_winner_name text,
  yesterday_winner_total_minutes int
)
language sql
security definer
set search_path = public
stable
as $$
  with bounds as (
    select ((now() at time zone 'utc') + interval '1 hour')::date as logical_today
  ),
  me as (
    select p.competition_group_id
    from public.profiles p
    where p.id = auth.uid()
  ),
  totals as (
    select
      cs.student_id,
      p.full_name,
      (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from public.coach_students cs
    join public.profiles p on p.id = cs.student_id
    left join public.student_tasks st
      on st.student_id = cs.student_id and st.task_date = (select logical_today from bounds)
    where cs.coach_id = (select coach_id from public.coach_students where student_id = auth.uid())
      and p.competition_status = 'active'
      and p.competition_group_id is not distinct from (select competition_group_id from me)
    group by cs.student_id, p.full_name
  ),
  ranked as (
    select student_id, full_name, total_minutes, rank() over (order by total_minutes desc) as rnk
    from totals
  ),
  my_total as (
    select (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from public.student_tasks st
    where st.student_id = auth.uid() and st.task_date = (select logical_today from bounds)
  ),
  -- Same roster/group/active-status scoping as `totals` above, one
  -- logical day back. total_minutes > 0 excludes a day nobody tracked
  -- anything on -- otherwise the "winner" would be an arbitrary student
  -- with 0 minutes rather than no card at all.
  yesterday_totals as (
    select
      cs.student_id,
      p.full_name,
      (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from public.coach_students cs
    join public.profiles p on p.id = cs.student_id
    left join public.student_tasks st
      on st.student_id = cs.student_id and st.task_date = (select logical_today - 1 from bounds)
    where cs.coach_id = (select coach_id from public.coach_students where student_id = auth.uid())
      and p.competition_status = 'active'
      and p.competition_group_id is not distinct from (select competition_group_id from me)
    group by cs.student_id, p.full_name
  ),
  yesterday_ranked as (
    select full_name, total_minutes
    from yesterday_totals
    where total_minutes > 0
    order by total_minutes desc
    limit 1
  )
  select
    (select rnk from ranked where student_id = auth.uid()),
    (select total_minutes from my_total),
    (select full_name from ranked order by rnk asc limit 1),
    (select total_minutes from ranked order by rnk asc limit 1),
    (select count(*)::int from ranked),
    (select full_name from yesterday_ranked),
    (select total_minutes from yesterday_ranked);
$$;

grant execute on function public.get_daily_stopwatch_ranking() to authenticated;

notify pgrst, 'reload schema';
