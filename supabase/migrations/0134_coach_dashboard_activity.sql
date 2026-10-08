-- Coach dashboard alerts: let the database do the counting.
--
-- The dashboard's "Aktif olmayan öğrenciler" and "Geçen hafta düşük performans" alerts used to download EVERY task row touched in the
-- last 3 days and EVERY task row of last week for the whole roster (thousands of rows, silently cut at 1000 by PostgREST) only to
-- reduce them to a yes/no and a done/total pair per student -- parsed and re-counted on every dashboard render. This function
-- returns exactly that reduction, one row per student, computed live on each call (nothing is cached, so the coach sees up-to-date
-- data whenever the dashboard renders).
--
--   recently_active : the student has at least one task touched (updated_at) since p_recent_since AND after it was created
--                     (a freshly assigned, never-opened task has updated_at = created_at and does not count as activity)
--   prev_total      : number of the student's tasks dated p_prev_from .. p_prev_to (last week)
--   prev_done       : how many of those have status 'done'
--
-- SECURITY INVOKER: it reads student_tasks as the calling coach, so row-level security decides which rows count -- the same rows
-- the dashboard's own queries could read before. Students with neither recent activity nor last-week tasks have no row.
--
-- Safe before/after the app deploy: until this function exists the app falls back to the old row queries (same result, slower).
-- Idempotent. Rollback: drop function public.coach_dashboard_activity(uuid[], timestamptz, date, date);

create or replace function public.coach_dashboard_activity(
  p_student_ids uuid[],
  p_recent_since timestamptz,
  p_prev_from date,
  p_prev_to date
)
returns table (
  student_id uuid,
  recently_active boolean,
  prev_total int,
  prev_done int
)
language sql
security invoker
stable
as $$
  with recent as (
    select distinct t.student_id
    from public.student_tasks t
    where t.student_id = any(p_student_ids)
      and t.updated_at >= p_recent_since
      and t.updated_at <> t.created_at
  ),
  prev as (
    select t.student_id,
           count(*)::int as total,
           (count(*) filter (where t.status = 'done'))::int as done
    from public.student_tasks t
    where t.student_id = any(p_student_ids)
      and t.task_date >= p_prev_from
      and t.task_date <= p_prev_to
    group by t.student_id
  )
  select
    coalesce(r.student_id, p.student_id) as student_id,
    (r.student_id is not null) as recently_active,
    coalesce(p.total, 0) as prev_total,
    coalesce(p.done, 0) as prev_done
  from recent r
  full join prev p on p.student_id = r.student_id;
$$;

grant execute on function public.coach_dashboard_activity(uuid[], timestamptz, date, date) to authenticated;

notify pgrst, 'reload schema';

-- Verification: expect one row, function_exists = true.
select exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'coach_dashboard_activity'
) as function_exists;
