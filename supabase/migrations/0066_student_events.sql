-- New "Time Block" entity -- non-task calendar events tied to a specific
-- student's schedule (school hours, sports, a coach meeting slot), kept
-- entirely separate from student_tasks (academic work) so a time block
-- never gets status checkboxes, D/Y/B stats, or drag-to-"Completed"
-- semantics. Distinct from the pre-existing coach_calendar_blocks table
-- (0011_coach_dashboard.sql), which is the coach's OWN personal calendar
-- with no student_id at all -- these are two unrelated concepts.
create type public.student_event_type as enum ('meeting', 'school', 'sports', 'personal', 'other');

create table public.student_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  event_type public.student_event_type not null default 'other',
  event_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_events_time_order check (end_time > start_time)
);

create index student_events_student_date_idx on public.student_events (student_id, event_date);
create index student_events_coach_idx on public.student_events (coach_id);

alter table public.student_events enable row level security;
grant select, insert, update, delete on public.student_events to authenticated;

-- Coach: full CRUD, scoped to their own roster (same coach_students-join
-- shape as every other per-student coach table) and, on writes, coach_id
-- must be their own -- same "claim ownership" convention as
-- student_tasks_coach_all.
create policy "student_events_coach_all" on public.student_events for all
  to authenticated
  using (
    exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_events.student_id)
  )
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_events.student_id)
  );

-- Student: read-only -- a student should be able to see "I have a coach
-- meeting at 14:30 today", but time blocks are coach-authored constraints,
-- not something a student edits themselves (matches this schema's own
-- convention of student-owned-but-coach-managed fields elsewhere).
create policy "student_events_student_read" on public.student_events for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "student_events_admin_all" on public.student_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
