-- Kanban scheduling board epic: topic-level granularity on student_tasks,
-- the same on student_resource_progress so topic-based analytics can
-- combine book-based and task-based logging, a breakdown table for the
-- "Karma" (mixed-topic) evaluation flow, and a coach's reusable Quick
-- Task Template palette.
--
-- Design notes:
--   - total_count/correct_count/wrong_count already exist on student_tasks
--     from earlier phases and mean exactly total_questions/correct_answers
--     /incorrect_answers -- reused rather than renamed, to avoid rippling
--     a column rename through every existing analytics reader on both
--     panels for zero functional gain.
--   - topic_id is free text, not FK'd to a real topics table (curriculum
--     is static JSON, not DB-backed) -- "karma" is just a sentinel string
--     convention on this column, same as any real topic id, and needs no
--     schema support of its own.
--   - video_url/video_title cache the fetched <title> at save time so the
--     smart-link Server Action isn't re-run on every board render.

alter table public.student_tasks
  add column topic_id text,
  add column video_url text,
  add column video_title text;

-- topic_id/video_url/video_title are coach-owned assignment metadata,
-- same tier as course_id/description -- guard them the same way.
create or replace function public.prevent_student_task_core_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
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
      or new.topic_id is distinct from old.topic_id
      or new.resource_id is distinct from old.resource_id
      or new.video_url is distinct from old.video_url
      or new.video_title is distinct from old.video_title
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

-- ---------------------------------------------------------------------
alter table public.student_resource_progress
  add column total_questions int,
  add column correct_answers int,
  add column incorrect_answers int;

-- ---------------------------------------------------------------------
create table public.student_task_topic_breakdown (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.student_tasks (id) on delete cascade,
  course_id text not null,
  topic_id text not null,
  total_questions int not null default 0,
  correct_answers int not null default 0,
  incorrect_answers int not null default 0,
  created_at timestamptz not null default now(),
  unique (task_id, topic_id)
);

create index student_task_topic_breakdown_task_idx on public.student_task_topic_breakdown (task_id);

alter table public.student_task_topic_breakdown enable row level security;
grant select, insert, update, delete on public.student_task_topic_breakdown to authenticated;

create policy "student_task_topic_breakdown_admin_all"
  on public.student_task_topic_breakdown for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "student_task_topic_breakdown_coach_all"
  on public.student_task_topic_breakdown for all
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = st.student_id
    where st.id = student_task_topic_breakdown.task_id
  ))
  with check (exists (
    select 1 from public.student_tasks st
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = st.student_id
    where st.id = student_task_topic_breakdown.task_id
  ));

create policy "student_task_topic_breakdown_student_all"
  on public.student_task_topic_breakdown for all
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    where st.id = student_task_topic_breakdown.task_id and st.student_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.student_tasks st
    where st.id = student_task_topic_breakdown.task_id and st.student_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------
-- Coach's reusable "Hızlı Ekle" palette. No student_id/resource_id --
-- resources are per-student, picked at drop time, not baked into the
-- template.
create table public.coach_task_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  task_type public.task_type not null,
  course_id text,
  topic_id text,
  total_count int,
  duration_minutes int,
  video_url text,
  video_title text,
  created_at timestamptz not null default now()
);

create index coach_task_templates_coach_idx on public.coach_task_templates (coach_id, created_at desc);

alter table public.coach_task_templates enable row level security;
grant select, insert, update, delete on public.coach_task_templates to authenticated;

create policy "coach_task_templates_admin_all"
  on public.coach_task_templates for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coach_task_templates_coach_all"
  on public.coach_task_templates for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));
