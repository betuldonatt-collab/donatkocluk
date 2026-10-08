-- Kronometre Yarışması, coach panel: each of a coach's own students gets their GLOBAL rank in the shared pool (see 0131), and the
-- overall 1st place student of a pool is visible to a coach even when that student belongs to the other coach.
--
-- A coach cannot read another coach's students (RLS), so this is a security-definer function that returns exactly:
--   * one row per ACTIVE student of the given coach -- with their rank among everyone in the same pool (any coach), by the
--     total of the selected month, and the pool's size;
--   * plus, for the pools the coach has students in, the pool's 1st place student(s) when they belong to someone else
--     (is_own = false). Nobody else of the other coach -- 2nd, 3rd, ... -- is ever returned.
-- A passive student of the coach is simply not in a pool, so gets no row (the app shows no rank for them), as in the student-side
-- ranking.
--
-- POOL = active students (with a coach) of the same group NAME, case-insensitive and trimmed -- the same rule as 0131; ungrouped
-- students form one pool. MEASURE = the sum of student_tasks.tracked_duration_minutes over the month (the same column and window
-- the coach's table shows in its monthly column). RANK = rank() within the pool (ties share a rank); a student with 0 minutes in
-- the month is shown in last place (the pool size), the same rule as the student-side leaderboard.
--
-- p_coach_id must be the caller (or the caller an admin, for impersonation); anyone else gets no rows.
--
-- Idempotent: safe to run more than once.
-- Rollback: drop function public.get_coach_stopwatch_ranking(uuid, date, date);

create or replace function public.get_coach_stopwatch_ranking(p_coach_id uuid, p_month_start date, p_month_end date)
returns table (
  student_id uuid,
  full_name text,
  is_own boolean,
  group_name text,
  monthly_minutes int,
  global_rank int,
  pool_size int
)
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select 1 as ok where p_coach_id = (select auth.uid()) or public.is_admin()
  ),
  members as (
    select
      p.id as student_id,
      p.full_name,
      g.name as group_name,
      lower(btrim(g.name)) as group_key,
      exists (
        select 1 from public.coach_students cs where cs.student_id = p.id and cs.coach_id = p_coach_id
      ) as is_own
    from public.profiles p
    left join public.student_groups g on g.id = p.competition_group_id
    where exists (select 1 from allowed)
      and p.competition_status = 'active'
      and exists (select 1 from public.coach_students cs where cs.student_id = p.id)
  ),
  -- only the pools this coach actually has (active) students in
  pools as (
    select distinct group_key from members where is_own
  ),
  totals as (
    select
      m.student_id, m.full_name, m.group_name, m.group_key, m.is_own,
      coalesce(sum(st.tracked_duration_minutes), 0)::int as monthly_minutes
    from members m
    left join public.student_tasks st
      on st.student_id = m.student_id and st.task_date >= p_month_start and st.task_date < p_month_end
    where m.group_key in (select group_key from pools) or (m.group_key is null and exists (select 1 from pools where group_key is null))
    group by m.student_id, m.full_name, m.group_name, m.group_key, m.is_own
  ),
  ranked as (
    select
      t.*,
      rank() over (partition by t.group_key order by t.monthly_minutes desc) as raw_rank,
      count(*) over (partition by t.group_key)::int as pool_size
    from totals t
  )
  select
    r.student_id,
    r.full_name,
    r.is_own,
    r.group_name,
    r.monthly_minutes,
    case when r.monthly_minutes = 0 then r.pool_size else r.raw_rank::int end as global_rank,
    r.pool_size
  from ranked r
  where r.is_own
     or (r.raw_rank = 1 and r.monthly_minutes > 0);
$$;

grant execute on function public.get_coach_stopwatch_ranking(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';

-- Verification: expect true, and (as the coach) only your own students plus at most the 1st place student of each pool.
select exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_coach_stopwatch_ranking'
) as rpc_exists;
