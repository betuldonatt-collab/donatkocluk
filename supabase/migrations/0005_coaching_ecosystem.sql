-- The coaching & task management ecosystem: scheduled sessions, coach
-- notes, and the richer per-day task model (replacing the fixed
-- DAILY_TASKS/WEEKLY_TASKS lists task_completions tracked against).
--
-- Design notes / deliberate deviations from the literal spec, called out
-- explicitly rather than silently:
--   - student_id/coach_id reference public.profiles(id), not auth.users(id)
--     directly. profiles.id already IS a 1:1 FK to auth.users(id), so
--     referential integrity to the real user is identical either way --
--     but every other table in this schema (coach_students,
--     student_resources, task_completions, ...) references profiles, and
--     RLS policies join against profiles for role checks. Referencing
--     auth.users here would be the one inconsistent table.
--   - student_tasks uses dedicated nullable columns rather than a JSONB
--     blob, matching the convention already used by paragraf_problem_entries
--     and task_completions. A generic set of columns is reused across task
--     types rather than one column per type (e.g. total/correct/wrong/empty
--     serve both question_bank and branch_exam; `completed` serves both
--     the video "watched" and topic_study "done" toggle) -- keeps the
--     table from growing a new column per task type.
--   - coach_id is nullable on student_tasks: a student adding their own
--     extra/custom task should be able to do so even before any coach is
--     assigned to them (coach_students has no row yet).

create type public.task_type as enum (
  'question_bank',
  'video',
  'topic_study',
  'branch_exam',
  'general_exam',
  'extra_custom'
);

-- ---------------------------------------------------------------------
create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_at timestamptz not null,
  meeting_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coaching_sessions_student_idx on public.coaching_sessions (student_id, scheduled_at);
create index coaching_sessions_coach_idx on public.coaching_sessions (coach_id, scheduled_at);

alter table public.coaching_sessions enable row level security;
grant select, insert, update, delete on public.coaching_sessions to authenticated;

create policy "coaching_sessions_admin_all"
  on public.coaching_sessions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coaching_sessions_coach_all"
  on public.coaching_sessions for all
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = coaching_sessions.student_id
  ))
  with check (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = coaching_sessions.student_id
    )
  );

create policy "coaching_sessions_student_read"
  on public.coaching_sessions for select
  to authenticated
  using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_notes_student_idx on public.coach_notes (student_id, created_at desc);

alter table public.coach_notes enable row level security;
grant select, insert, update, delete on public.coach_notes to authenticated;

create policy "coach_notes_admin_all"
  on public.coach_notes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coach_notes_coach_all"
  on public.coach_notes for all
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = coach_notes.student_id
  ))
  with check (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = coach_notes.student_id
    )
  );

create policy "coach_notes_student_read"
  on public.coach_notes for select
  to authenticated
  using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
create table public.student_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  task_date date not null,
  task_type public.task_type not null,
  title text not null,
  description text,

  -- question_bank / branch_exam / general_exam
  course_id text,
  resource_id uuid references public.student_resources (id) on delete set null,
  total_count int,
  correct_count int,
  wrong_count int,
  empty_count int,
  duration_minutes int, -- branch_exam, TYT only

  -- video (watched) / topic_study (done) -- meaning depends on task_type
  completed boolean not null default false,

  -- branch_exam / general_exam "Analizi Sonra Yap"
  analysis_pending boolean not null default false,

  -- Ödevler-style checklist state, independent of analysis_pending
  status public.task_status not null default 'pending',
  reason text,
  note text,

  is_coach_assigned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_tasks_student_date_idx on public.student_tasks (student_id, task_date);
create index student_tasks_coach_idx on public.student_tasks (coach_id, task_date);

alter table public.student_tasks enable row level security;
grant select, insert, update, delete on public.student_tasks to authenticated;

create policy "student_tasks_admin_all"
  on public.student_tasks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "student_tasks_coach_all"
  on public.student_tasks for all
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_tasks.student_id
  ))
  with check (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_tasks.student_id
    )
  );

create policy "student_tasks_student_select"
  on public.student_tasks for select
  to authenticated
  using (student_id = (select auth.uid()));

-- A student may only ever INSERT their own non-coach-assigned ("Diğer /
-- Ekstra Çalışmalar") tasks; only a coach (via the policy above) can
-- create a coach-assigned one.
create policy "student_tasks_student_insert_custom"
  on public.student_tasks for insert
  to authenticated
  with check (student_id = (select auth.uid()) and is_coach_assigned = false);

-- Gates "is this my own row" at the RLS layer; the trigger below is what
-- actually stops a student from editing a coach-assigned task's core
-- fields (RLS alone can't restrict *which columns* an UPDATE touches).
create policy "student_tasks_student_update"
  on public.student_tasks for update
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- A student may only delete their own non-coach-assigned tasks.
create policy "student_tasks_student_delete_custom"
  on public.student_tasks for delete
  to authenticated
  using (student_id = (select auth.uid()) and is_coach_assigned = false);

-- Blocks a student (not the assigning coach, not an admin) from changing
-- a coach-assigned task's core parameters -- they may still update their
-- own progress/result fields (counts, completed, analysis_pending,
-- status, reason, note).
create function public.prevent_student_task_core_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.is_coach_assigned = true
    and not public.is_admin()
    and not exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = old.student_id
    )
  then
    if new.task_date is distinct from old.task_date
      or new.task_type is distinct from old.task_type
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.course_id is distinct from old.course_id
      or new.resource_id is distinct from old.resource_id
      or new.coach_id is distinct from old.coach_id
      or new.student_id is distinct from old.student_id
      or new.is_coach_assigned is distinct from old.is_coach_assigned
    then
      raise exception 'Only the assigning coach can change a coach-assigned task''s core details';
    end if;
  end if;
  return new;
end;
$$;

create trigger student_tasks_prevent_core_tampering
  before update on public.student_tasks
  for each row execute function public.prevent_student_task_core_tampering();
