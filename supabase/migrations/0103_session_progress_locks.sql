-- Progress tracking moves from a fixed Monday-Sunday calendar week to a
-- session-to-session cycle: the coach's own "kilitle" (lock) action stays
-- the anchor (it naturally happens at/after a coaching session), but the
-- window it opens no longer has to line up with any particular weekday.
--
-- progress_locks replaces week_locks entirely. Note for context: week_locks
-- .locked_at/.locked_by were already dropped as dead columns back in 0043,
-- at a time when nothing read them -- the "lock day, not Monday" branch in
-- lib/completion.ts was added later and never got those columns restored,
-- so that branch has actually been unreachable in production ever since;
-- every student has silently been on the Monday fallback the whole time.
-- This migration (and the same commit's lib/completion.ts rewrite) is a
-- clean replacement, not a fix to the old column.
--
-- Each row here is one lock EVENT, not one week: period_start is the first
-- day of the cycle THIS lock closes (the previous lock's own day, or -- for
-- a student's very first lock -- the day of their first completed coaching
-- session), and locked_at is when the coach closed it. The LOCK DAY ITSELF
-- belongs to the new, still-open cycle, not the one being closed -- a coach
-- typically locks during a same-day session and, in that same sitting,
-- assigns new tasks for that same day; those tasks need to land in the new
-- cycle, not the one just closed. The single most recent row per student is
-- everything the app needs: it IS the closed "previous cycle" ([period_start,
-- the day BEFORE locked_at's date]), and it tells you the open "current
-- cycle" starts ON locked_at's date -- no history walk required.
create table public.progress_locks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  locked_at timestamptz not null default now(),
  locked_by uuid references public.profiles(id) on delete set null,
  -- Strictly before, not <= : the lock day itself is never part of the
  -- cycle this row closes (see the header comment above), so a lock can't
  -- be created twice on the same calendar day for the same student -- the
  -- app enforces that explicitly (app/coach/actions.ts's lockCurrentCycle)
  -- and this is the DB-level backstop.
  constraint progress_locks_period_valid check (period_start < locked_at::date)
);

create index progress_locks_student_idx on public.progress_locks (student_id, locked_at desc);

alter table public.progress_locks enable row level security;

grant select, insert, delete on public.progress_locks to authenticated;

create policy "progress_locks_coach_all"
  on public.progress_locks for all
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = progress_locks.student_id
  ))
  with check (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = progress_locks.student_id
  ));

create policy "progress_locks_admin_all"
  on public.progress_locks for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "progress_locks_student_read"
  on public.progress_locks for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "progress_locks_parent_read"
  on public.progress_locks for select
  to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = progress_locks.student_id
  ));

-- A task is frozen once its date falls STRICTLY BEFORE the student's LATEST
-- lock day -- the lock day itself stays editable, since it belongs to the
-- new, still-open cycle (see the header comment above). One boundary
-- timestamp per student, not a per-week flag -- replaces both
-- week_start_of() and is_week_locked() at once.
create or replace function public.is_task_locked(p_student_id uuid, p_task_date date)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    p_task_date < (select max(locked_at)::date from public.progress_locks where student_id = p_student_id),
    false
  );
$$;

drop policy "student_tasks_student_update" on public.student_tasks;
create policy "student_tasks_student_update"
  on public.student_tasks for update
  to authenticated
  using (student_id = (select auth.uid()) and not is_task_locked(student_id, task_date))
  with check (student_id = (select auth.uid()) and not is_task_locked(student_id, task_date));

drop policy "student_tasks_student_insert_custom" on public.student_tasks;
create policy "student_tasks_student_insert_custom" on public.student_tasks for insert
  to authenticated
  with check (
    student_id = (select auth.uid())
    and is_coach_assigned = false
    and is_approved_by_coach = false
    and not is_task_locked(student_id, task_date)
  );

drop policy "student_tasks_student_delete_custom" on public.student_tasks;
create policy "student_tasks_student_delete_custom"
  on public.student_tasks for delete
  to authenticated
  using (
    student_id = (select auth.uid())
    and is_coach_assigned = false
    and task_type <> 'branch_exam'
    and not is_task_locked(student_id, task_date)
  );

-- Fully superseded -- nothing reads week_locks after this migration (see
-- lib/completion.ts and every app/*/actions.ts + page.tsx this same commit
-- updates).
drop function if exists public.is_week_locked(uuid, date);
drop function if exists public.week_start_of(date);
drop table if exists public.week_locks;

notify pgrst, 'reload schema';
