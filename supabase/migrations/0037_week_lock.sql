-- Group 1 (Week Lock & Task Freeze): a coach can finalize a student's
-- past/current week so its completion numbers stop moving. Locking is a
-- per-week fact (student_id + Monday-start week), not a per-task flag --
-- one row covers every task in that week regardless of how many exist,
-- and reopening is just deleting the row (no per-task unwind needed).
create table public.week_locks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  week_start_date date not null,
  locked_at timestamptz not null default now(),
  locked_by uuid references public.profiles(id) on delete set null,
  unique (student_id, week_start_date)
);

create index week_locks_student_idx on public.week_locks (student_id);

alter table public.week_locks enable row level security;

grant select, insert, delete on public.week_locks to authenticated;

create policy "week_locks_coach_all"
  on public.week_locks for all
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = week_locks.student_id
  ))
  with check (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = week_locks.student_id
  ));

create policy "week_locks_admin_all"
  on public.week_locks for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "week_locks_student_read"
  on public.week_locks for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "week_locks_parent_read"
  on public.week_locks for select
  to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = week_locks.student_id
  ));

-- Monday-start week of a date -- matches every getWeekDays() helper
-- duplicated across the app (isodow: Monday=1 .. Sunday=7).
create or replace function public.week_start_of(p_date date)
returns date
language sql
immutable
as $$
  select p_date - (extract(isodow from p_date)::int - 1);
$$;

create or replace function public.is_week_locked(p_student_id uuid, p_task_date date)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.week_locks
    where student_id = p_student_id
      and week_start_date = public.week_start_of(p_task_date)
  );
$$;

-- Enforce the freeze at the RLS layer itself -- a locked task must reject
-- the student's own writes regardless of what the UI does or doesn't
-- disable. Coach/admin policies on student_tasks are untouched: a coach
-- can still correct a locked week's tasks if they made a mistake locking
-- it -- only the STUDENT side is frozen.
drop policy "student_tasks_student_update" on public.student_tasks;
create policy "student_tasks_student_update"
  on public.student_tasks for update
  to authenticated
  using (student_id = (select auth.uid()) and not is_week_locked(student_id, task_date))
  with check (student_id = (select auth.uid()) and not is_week_locked(student_id, task_date));

drop policy "student_tasks_student_insert_custom" on public.student_tasks;
create policy "student_tasks_student_insert_custom"
  on public.student_tasks for insert
  to authenticated
  with check (student_id = (select auth.uid()) and is_coach_assigned = false and not is_week_locked(student_id, task_date));

drop policy "student_tasks_student_delete_custom" on public.student_tasks;
create policy "student_tasks_student_delete_custom"
  on public.student_tasks for delete
  to authenticated
  using (student_id = (select auth.uid()) and is_coach_assigned = false and not is_week_locked(student_id, task_date));
