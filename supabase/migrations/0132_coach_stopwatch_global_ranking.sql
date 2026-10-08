-- Kronometre Yarışması, coach panel: each of a coach's own students gets the SAME rank their own widget shows (the global DAILY rank in
-- the shared pool, see 0131), and the overall 1st place student of a pool is visible to a coach even when that student belongs to the
-- other coach.
--
-- This mirrors get_daily_stopwatch_ranking() (0131) exactly, so the number a coach reads equals the number the student sees:
--   * MEASURE: today's tracked time on the same logical day (02:00 Turkey time), (sum(tracked_duration_seconds) / 60)::int.
--   * POOL: active students (with a coach) of the same group NAME, case-insensitive and trimmed; ungrouped students form one pool.
--   * RANK: rank() over the WHOLE pool (ties share a rank), and a student with 0 minutes today is shown in last place (the pool
--     size) -- the same override the student-side ranking applies.
-- The rank is computed here, over the entire pool, BEFORE anything is hidden: when the pool is 1-a, 2-a, 3-b, 4-a, 5-a ('a' = this
-- coach's students, 'b' = the other coach's), the coach gets ranks 1, 2, 4 and 5 -- 3-b is not returned, but 4-a still reads 4.
--
-- A coach cannot read another coach's students (RLS), so this is a security-definer function that returns exactly:
--   * one row per ACTIVE student of the given coach: their global rank, the pool's size and their minutes today;
--   * plus, for the pools the coach has students in, the pool's 1st place student(s) when they belong to someone else
--     (is_own = false) and have tracked time today. Nobody else of the other coach -- 2nd, 3rd, ... -- is ever returned.
-- A passive student of the coach is not in a pool, so gets no row (the app shows no rank for them), as on the student side.
--
-- p_coach_id must be the caller (or the caller an admin, for impersonation); anyone else gets no rows.
--
-- Replaces the first version of this function, which took a month window (and ranked by the month); that one is dropped.
-- Idempotent: safe to run more than once.
-- Rollback: drop function public.get_coach_stopwatch_ranking(uuid);

drop function if exists public.get_coach_stopwatch_ranking(uuid, date, date);

create or replace function public.get_coach_stopwatch_ranking(p_coach_id uuid)
returns table (
  student_id uuid,
  full_name text,
  is_own boolean,
  group_name text,
  daily_minutes int,
  global_rank int,
  pool_size int
)
language sql
security definer
set search_path = public
stable
as $$
  with bounds as (
    select ((now() at time zone 'utc') + interval '1 hour')::date as logical_today
  ),
  allowed as (
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
      (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as daily_minutes
    from members m
    left join public.student_tasks st
      on st.student_id = m.student_id and st.task_date = (select logical_today from bounds)
    where m.group_key in (select group_key from pools) or (m.group_key is null and exists (select 1 from pools where group_key is null))
    group by m.student_id, m.full_name, m.group_name, m.group_key, m.is_own
  ),
  ranked as (
    select
      t.*,
      rank() over (partition by t.group_key order by t.daily_minutes desc) as raw_rank,
      count(*) over (partition by t.group_key)::int as pool_size
    from totals t
  )
  select
    r.student_id,
    r.full_name,
    r.is_own,
    r.group_name,
    r.daily_minutes,
    case when r.daily_minutes = 0 then r.pool_size else r.raw_rank::int end as global_rank,
    r.pool_size
  from ranked r
  where r.is_own
     or (r.raw_rank = 1 and r.daily_minutes > 0);
$$;

grant execute on function public.get_coach_stopwatch_ranking(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verification: expect true, true (the month-window version is gone, the daily one exists).
select
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_coach_stopwatch_ranking' and p.pronargs = 1
  ) as daily_rpc_exists,
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_coach_stopwatch_ranking' and p.pronargs = 3
  ) as month_version_gone;
