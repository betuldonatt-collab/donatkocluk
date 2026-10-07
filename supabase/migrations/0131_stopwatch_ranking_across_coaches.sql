-- Kronometre Yarışması: students compete against everyone in their group, whichever coach they belong to.
--
-- Until now get_daily_stopwatch_ranking() ranked a student only against the students of THEIR OWN coach (and their own group).
-- With two coaches that split the competition in two. The ranked pool is now every ACTIVE student, of any coach, who is in the
-- same group as the caller.
--
-- GROUPS. A group (public.student_groups, 0068) belongs to one coach -- "Lise" of one coach and "Lise" of the other are two rows
-- with two ids. So "the same group" is matched by NAME (case-insensitive, trimmed), not by id; a student with no group at all
-- competes with every other ungrouped student, as before (null-safe). If the two coaches spell a group differently ("Lise" /
-- "Lise 11") they stay separate pools -- rename one so the names match.
--
-- UNCHANGED: the function's name, arguments and result columns (so the app, the widget and its UI need nothing), the "active"
-- competition status requirement, the logical day (02:00 Turkey time), tracked_duration_seconds as the measure, "yesterday's
-- winner", and the rule that a caller with 0 minutes sees themselves in last place. A student with no coach at all still gets
-- an empty result (participant_count 0), exactly as before. The coach-side roster ranking is a different query and is not touched.
--
-- Idempotent: safe to run more than once.
-- Rollback: run 0095 again (create or replace restores the per-coach version).

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
  -- The caller's group, as a name (null = ungrouped). Names are compared case-insensitively and trimmed.
  me as (
    select lower(btrim(g.name)) as group_key
    from public.profiles p
    left join public.student_groups g on g.id = p.competition_group_id
    where p.id = auth.uid()
  ),
  -- Everyone the caller competes with: active students of ANY coach in the same group. A caller who has no coach at all
  -- competes with nobody (empty pool), as before.
  pool as (
    select p.id as student_id, p.full_name
    from public.profiles p
    left join public.student_groups g on g.id = p.competition_group_id
    where p.competition_status = 'active'
      and exists (select 1 from public.coach_students cs where cs.student_id = p.id)
      and exists (select 1 from public.coach_students cs where cs.student_id = auth.uid())
      and lower(btrim(g.name)) is not distinct from (select group_key from me)
  ),
  totals as (
    select
      pool.student_id,
      pool.full_name,
      (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from pool
    left join public.student_tasks st
      on st.student_id = pool.student_id and st.task_date = (select logical_today from bounds)
    group by pool.student_id, pool.full_name
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
  -- The same pool, one logical day back. total_minutes > 0 excludes a day nobody tracked anything on -- otherwise the
  -- "winner" would be an arbitrary student with 0 minutes rather than no card at all.
  yesterday_totals as (
    select
      pool.student_id,
      pool.full_name,
      (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from pool
    left join public.student_tasks st
      on st.student_id = pool.student_id and st.task_date = (select logical_today - 1 from bounds)
    group by pool.student_id, pool.full_name
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

-- Verification: expect true, true (the per-coach filter is gone and the group is matched by name), and then compare the two
-- coaches' group names below -- the same name (ignoring case and spaces) means one shared pool.
select
  position('cs.coach_id' in pg_get_functiondef('public.get_daily_stopwatch_ranking()'::regprocedure)) = 0 as per_coach_filter_gone,
  position('lower(btrim(g.name))' in pg_get_functiondef('public.get_daily_stopwatch_ranking()'::regprocedure)) > 0 as groups_matched_by_name;

select string_agg(distinct g.name, ' / ') as group_names, count(distinct g.coach_id) as coaches_using_it, count(p.id) as students
from public.student_groups g
left join public.profiles p on p.competition_group_id = g.id
group by lower(btrim(g.name))
order by lower(btrim(g.name));
