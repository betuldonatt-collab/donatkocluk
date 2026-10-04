-- "Yazılılar": a student's school-exam (yazılı) grades and their school courses.
--
-- Two tables:
--   student_school_courses -- one row per course a student has CUSTOMISED or used:
--       * a default course of their grade (matematik, fizik, ...; the lists live in code,
--         lib/school-exams.ts) gets a row lazily, the first time the student saves a
--         colour, a grade or a removal request on it -- so a row never exists for a
--         course that was merely displayed;
--       * a custom course the student added ("+ Yeni Ders Ekle") is a row with
--         is_custom = true.
--   student_school_grades -- one grade per (course, term, yazılı number): term 1 or 2,
--         exam_no 1 (I. Yazılı) or 2 (II. Yazılı), 0-100. No average is stored or computed
--         (teachers' oral/performance weights are unknown).
--
-- Removing a DEFAULT course ("bu dersi almıyorum") needs the coach's approval:
--   removal_status 'none' -> 'pending' (student asks) -> coach approves (removed_at set,
--   the course is hidden for good) or rejects ('rejected', the student may ask again).
--   A custom course the student made is deleted outright by the student.
--
-- Access: a student reads/writes only their own rows; their coach reads them and decides
-- removal requests; admins can do everything. A trigger keeps a student from approving
-- their own removal or touching anything but the allowed removal_status transitions.
-- Parents get read access later (not part of this migration).
--
-- Rollback: drop table public.student_school_grades; drop table public.student_school_courses;
--           drop function public.guard_student_school_course_update();

create table public.student_school_courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  -- A default course's stable key ('matematik', 'almanca', ...) or 'custom-<uuid>'.
  course_key text not null check (length(course_key) between 1 and 60),
  is_custom boolean not null default false,
  -- The display name (snapshotted for default courses so the coach's screen can show it).
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Palette key (lib/school-exams.ts SCHOOL_COLORS); null = the course's default colour.
  color text check (color is null or length(color) <= 20),
  sort_order int not null default 0,
  removal_status text not null default 'none' check (removal_status in ('none', 'pending', 'rejected')),
  removal_requested_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, course_key)
);

create index student_school_courses_student_idx on public.student_school_courses (student_id);
create index student_school_courses_pending_idx on public.student_school_courses (student_id) where removal_status = 'pending';

create table public.student_school_grades (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_school_courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  term smallint not null check (term in (1, 2)),
  exam_no smallint not null check (exam_no in (1, 2)),
  grade numeric(5, 2) not null check (grade >= 0 and grade <= 100),
  updated_at timestamptz not null default now(),
  unique (course_id, term, exam_no)
);

create index student_school_grades_student_idx on public.student_school_grades (student_id);

alter table public.student_school_courses enable row level security;
alter table public.student_school_grades enable row level security;

grant select, insert, update, delete on public.student_school_courses to authenticated;
grant select, insert, update, delete on public.student_school_grades to authenticated;

-- === courses: policies =======================================================

create policy "school_courses_student_select" on public.student_school_courses for select to authenticated
  using (student_id = (select auth.uid()));

-- A student can only create a fresh, not-removed, not-pending course row for themselves.
create policy "school_courses_student_insert" on public.student_school_courses for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and removal_status = 'none'
    and removed_at is null
  );

create policy "school_courses_student_update" on public.student_school_courses for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- Only a course the student made themselves can be deleted by them.
create policy "school_courses_student_delete" on public.student_school_courses for delete to authenticated
  using (student_id = (select auth.uid()) and is_custom);

create policy "school_courses_coach_select" on public.student_school_courses for select to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_courses.student_id
  ));

-- The coach decides removal requests (the trigger below limits what they may change).
create policy "school_courses_coach_update" on public.student_school_courses for update to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_courses.student_id
  ))
  with check (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_courses.student_id
  ));

create policy "school_courses_admin_all" on public.student_school_courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- === grades: policies ========================================================

create policy "school_grades_student_all" on public.student_school_grades for all to authenticated
  using (student_id = (select auth.uid()))
  with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.student_school_courses c
      where c.id = student_school_grades.course_id
        and c.student_id = (select auth.uid())
        and c.removed_at is null
    )
  );

create policy "school_grades_coach_select" on public.student_school_grades for select to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_grades.student_id
  ));

create policy "school_grades_admin_all" on public.student_school_grades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- === guard: what a student may change on a course ============================
-- A student may recolour / rename (custom) / reorder their course and move
-- removal_status none -> pending (ask), rejected -> pending (ask again) and
-- pending -> none (withdraw). Nothing else: not removed_at, not 'rejected', not the
-- owner or the key. A coach or an admin may do the coach's part (approve = set
-- removed_at; reject = 'rejected'; both clear a pending request).

create or replace function public.guard_student_school_course_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from public.coach_students cs
    where cs.coach_id = auth.uid() and cs.student_id = old.student_id
  ) then
    if new.student_id is distinct from old.student_id
      or new.course_key is distinct from old.course_key
      or new.is_custom is distinct from old.is_custom
      or new.name is distinct from old.name
      or new.color is distinct from old.color
    then
      raise exception 'A coach can only decide a removal request';
    end if;
    return new;
  end if;

  -- The student (or anyone else without the coach link).
  if new.student_id is distinct from old.student_id
    or new.course_key is distinct from old.course_key
    or new.is_custom is distinct from old.is_custom
    or new.removed_at is distinct from old.removed_at
  then
    raise exception 'This course field cannot be changed';
  end if;
  if new.removal_status is distinct from old.removal_status
    and not (
      (old.removal_status = 'none' and new.removal_status = 'pending')
      or (old.removal_status = 'rejected' and new.removal_status = 'pending')
      or (old.removal_status = 'pending' and new.removal_status = 'none')
    )
  then
    raise exception 'A removal request needs the coach''s decision';
  end if;
  -- Renaming is for custom courses only.
  if not old.is_custom and new.name is distinct from old.name then
    raise exception 'A default course cannot be renamed';
  end if;
  return new;
end;
$$;

create trigger guard_student_school_course_update
  before update on public.student_school_courses
  for each row execute function public.guard_student_school_course_update();

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select count(*) from public.student_school_courses;   -- expect 0
--   select count(*) from public.student_school_grades;    -- expect 0
