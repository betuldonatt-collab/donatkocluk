-- Kronometre Yarışması bug: get_daily_stopwatch_ranking() and
-- fetchStopwatchCompetitionRoster (app/coach/actions.ts) were both summing
-- student_tasks.duration_minutes directly. That column is written by FOUR
-- different sources -- a coach's target duration at assignment
-- (buildTaskRows), a student's own target on a self-created task
-- (createRichCustomTask), a student manually typing an exam's duration
-- after the fact (updateTaskProgress from task-modal.tsx), and the Focus
-- Timer accumulating real tracked seconds onto it (also updateTaskProgress,
-- from focus-timer-trigger.tsx) -- so simply assigning a task with a target
-- duration inflated the leaderboard instantly, with zero stopwatch use.
--
-- tracked_duration_minutes is a new, single-purpose column: only the Focus
-- Timer's completion path (focus-timer-trigger.tsx) ever writes to it, and
-- it starts every row at 0. No backfill UPDATE for existing rows -- checked
-- directly against production first (see conversation): only 7 of the 50
-- rows carrying any duration_minutes value were ever modified after
-- creation, none with a reliable way to attribute how much of that value
-- (if any) was genuine tracked time vs. a target, and the coach reviewing
-- that exact list confirmed leaving all of them at the safe default of 0 --
-- tracked time accumulates fresh from this migration forward.
alter table public.student_tasks add column tracked_duration_minutes int not null default 0;

-- Supersedes 0068's get_daily_stopwatch_ranking(): same shape and same
-- competition_group_id/competition_status scoping, only the summed column
-- changes (duration_minutes -> tracked_duration_minutes).
create or replace function public.get_daily_stopwatch_ranking()
returns table (
  my_rank int,
  my_total_minutes int,
  top_student_name text,
  top_student_total_minutes int,
  participant_count int
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select p.competition_group_id
    from public.profiles p
    where p.id = auth.uid()
  ),
  totals as (
    select
      cs.student_id,
      p.full_name,
      coalesce(sum(st.tracked_duration_minutes), 0)::int as total_minutes
    from public.coach_students cs
    join public.profiles p on p.id = cs.student_id
    left join public.student_tasks st
      on st.student_id = cs.student_id and st.task_date = (now() at time zone 'utc')::date
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
    select coalesce(sum(st.tracked_duration_minutes), 0)::int as total_minutes
    from public.student_tasks st
    where st.student_id = auth.uid() and st.task_date = (now() at time zone 'utc')::date
  )
  select
    (select rnk from ranked where student_id = auth.uid()),
    (select total_minutes from my_total),
    (select full_name from ranked order by rnk asc limit 1),
    (select total_minutes from ranked order by rnk asc limit 1),
    (select count(*)::int from ranked);
$$;

grant execute on function public.get_daily_stopwatch_ranking() to authenticated;

notify pgrst, 'reload schema';
