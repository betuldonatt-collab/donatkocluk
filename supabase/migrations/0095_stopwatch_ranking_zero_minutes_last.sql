-- Kronometre Yarışması: a student with 0 minutes today must always see
-- their OWN rank as last place, never a low rank number from being tied
-- with other 0-minute students.
--
-- rank() over (order by total_minutes desc) gives every tied row the SAME
-- rank -- so on a day nobody in the group has tracked anything yet (or
-- only one or two students have), a student who hasn't started sees
-- themselves at rank 1 or 2, tied with everyone else at 0. That reads as
-- "nobody's studying and I'm already near the top", which is exactly the
-- wrong signal to send someone who hasn't started -- the whole point of
-- the widget is to nudge them to.
--
-- Fix: my_rank is forced to participant_count (last place) whenever the
-- caller's own total is 0 -- but only when they're actually a ranked
-- participant in the first place (student_id present in `ranked`, i.e.
-- competition_status = 'active' and same group as everyone else); a
-- passive/unranked student with 0 minutes still correctly gets null, not
-- a fake last-place rank. Every other row (top student, participant
-- count, yesterday's winner) is untouched -- this only changes what the
-- caller sees as THEIR OWN position.
--
-- Idempotent: safe to run more than once.

create or replace function public.get_daily_stopwatch_ranking()
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
    case
      when (select total_minutes from my_total) = 0
        and (select rnk from ranked where student_id = auth.uid()) is not null
      then (select count(*)::int from ranked)
      else (select rnk from ranked where student_id = auth.uid())
    end,
    (select total_minutes from my_total),
    (select full_name from ranked order by rnk asc limit 1),
    (select total_minutes from ranked order by rnk asc limit 1),
    (select count(*)::int from ranked),
    (select full_name from yesterday_ranked),
    (select total_minutes from yesterday_ranked);
$$;

grant execute on function public.get_daily_stopwatch_ranking() to authenticated;

notify pgrst, 'reload schema';

-- Verification: confirm the function body now carries the zero-minutes
-- override (expect true).
select position('when (select total_minutes from my_total) = 0' in
  pg_get_functiondef('public.get_daily_stopwatch_ranking()'::regprocedure)) > 0
  as ranking_forces_zero_minutes_to_last;
