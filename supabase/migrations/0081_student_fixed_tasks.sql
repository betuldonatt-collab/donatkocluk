-- "Sabit Görevler" (Fixed Tasks) -- the student's recurring weekly
-- skeleton (school hours, sports practice, ...), entered once by the
-- coach and shown every week without re-entering it. Deliberately its
-- own table, not folded into student_tasks: these have no date, no
-- status, no D/Y/B, and are never dragged/reordered on the weekly
-- planner -- same "keep it structurally separate" reasoning student_events
-- (0066_student_events.sql) already established for time blocks, which
-- this table otherwise closely mirrors (RLS shape below is copied
-- directly from it).
--
-- One row per single day, NOT a days-of-week array: the coach may write a
-- different fixed schedule per day (e.g. Monday: Math, Physics; Tuesday:
-- Biology), so "day_of_week int" + one row per (title, day) pairing is
-- the correct shape, not one row covering a whole day range.
--
-- day_of_week: 0=Monday..6=Sunday, matching this app's own existing
-- convention (mondayIndexOf/DAY_LABELS_SHORT in schedule-board.tsx and
-- task-drawer.tsx) -- not a new one.
--
-- No is_active flag and no order_index: these aren't paused, only added
-- or deleted outright, and they never interleave into the tasks/events
-- drag order -- they render as a separate, read-only lane.
create table public.student_fixed_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_fixed_tasks_time_order check (end_time > start_time)
);

create index student_fixed_tasks_student_day_idx on public.student_fixed_tasks (student_id, day_of_week);
create index student_fixed_tasks_coach_idx on public.student_fixed_tasks (coach_id);

alter table public.student_fixed_tasks enable row level security;
grant select, insert, update, delete on public.student_fixed_tasks to authenticated;

-- Coach: full CRUD, scoped to their own roster -- same shape as
-- student_events_coach_all.
create policy "student_fixed_tasks_coach_all" on public.student_fixed_tasks for all
  to authenticated
  using (
    exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_fixed_tasks.student_id)
  )
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_fixed_tasks.student_id)
  );

-- Student: read-only -- coach-authored constraint, same as
-- student_events_student_read. The student sees their own fixed
-- skeleton on their own dashboard/weekly view but never edits it.
create policy "student_fixed_tasks_student_read" on public.student_fixed_tasks for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "student_fixed_tasks_admin_all" on public.student_fixed_tasks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
