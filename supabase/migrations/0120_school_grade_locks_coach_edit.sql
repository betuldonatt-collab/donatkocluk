-- Yazılılar, coach side: the coach edits a student's school-exam grades, and can LOCK any single grade so the
-- student can no longer change it.
--
-- 1. student_school_grades gets is_locked / locked_at. A lock belongs to one grade (one course + term + yazılı);
--    an unlocked grade stays editable by both the student and the coach. A lock needs a saved grade (the row IS
--    the grade), so a coach locks a grade after it is entered; deleting a grade deletes its lock with it.
-- 2. The coach (a coach_students link) may now INSERT / UPDATE / DELETE a rostered student's grades, and create
--    the lazy row of a DEFAULT course for them (so a coach can enter a grade the student never touched). Before
--    this migration the coach could only read them and decide removal requests (0118).
-- 3. A trigger enforces the lock in the database, not just in the screens:
--      - the student cannot update or delete a locked grade, cannot lock/unlock anything, and cannot insert a
--        grade that is already locked;
--      - the coach / an admin can do everything, and the trigger keeps locked_at consistent with is_locked.
--
-- Safe to run on a live system: the new columns are NOT NULL DEFAULT false (a constant default, no rewrite) /
-- nullable, so every existing grade is simply unlocked, and the app reads tolerate the columns being absent.
--
-- Rollback:
--   drop trigger guard_student_school_grade_write on public.student_school_grades;
--   drop function public.guard_student_school_grade_write();
--   drop policy "school_courses_coach_insert" on public.student_school_courses;
--   drop policy "school_grades_coach_insert" on public.student_school_grades;
--   drop policy "school_grades_coach_update" on public.student_school_grades;
--   drop policy "school_grades_coach_delete" on public.student_school_grades;
--   alter table public.student_school_grades drop column is_locked, drop column locked_at;

alter table public.student_school_grades
  add column if not exists is_locked boolean not null default false,
  add column if not exists locked_at timestamptz;

-- === the coach may create a student's default-course row ======================
-- (never a custom course -- those are the student's own -- and never an already-removed / pending one)
create policy "school_courses_coach_insert" on public.student_school_courses for insert to authenticated
  with check (
    is_custom = false
    and removal_status = 'none'
    and removed_at is null
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_courses.student_id
    )
  );

-- === the coach may write a rostered student's grades ==========================
create policy "school_grades_coach_insert" on public.student_school_grades for insert to authenticated
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_grades.student_id
    )
    and exists (
      select 1 from public.student_school_courses c
      where c.id = student_school_grades.course_id
        and c.student_id = student_school_grades.student_id
        and c.removed_at is null
    )
  );

create policy "school_grades_coach_update" on public.student_school_grades for update to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_grades.student_id
  ))
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_grades.student_id
    )
    and exists (
      select 1 from public.student_school_courses c
      where c.id = student_school_grades.course_id
        and c.student_id = student_school_grades.student_id
        and c.removed_at is null
    )
  );

create policy "school_grades_coach_delete" on public.student_school_grades for delete to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_school_grades.student_id
  ));

-- === the lock, enforced in the database =======================================
create or replace function public.guard_student_school_grade_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  owner uuid;
begin
  -- NEW does not exist in a DELETE trigger and OLD does not in an INSERT one; CASE only evaluates the branch
  -- that applies, so neither is touched when it is absent.
  owner := case when tg_op = 'DELETE' then old.student_id else new.student_id end;

  -- Admins, the service role and the student's coach decide the lock.
  if auth.role() = 'service_role'
    or public.is_admin()
    or exists (
      select 1 from public.coach_students cs
      where cs.coach_id = auth.uid() and cs.student_id = owner
    )
  then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'INSERT' then
      new.locked_at := case when new.is_locked then now() else null end;
    else
      new.locked_at := case
        when not new.is_locked then null
        when old.is_locked then coalesce(old.locked_at, now())
        else now()
      end;
    end if;
    return new;
  end if;

  -- The student (or anyone without the coach link): a locked grade is read-only, and the lock itself is
  -- not theirs to touch.
  if tg_op = 'INSERT' then
    if new.is_locked then
      raise exception 'A grade cannot be locked by the student';
    end if;
    new.locked_at := null;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.is_locked then
      raise exception 'This grade is locked by the coach';
    end if;
    if new.is_locked is distinct from old.is_locked or new.locked_at is distinct from old.locked_at then
      raise exception 'A grade cannot be locked by the student';
    end if;
    return new;
  else
    if old.is_locked then
      raise exception 'This grade is locked by the coach';
    end if;
    return old;
  end if;
end;
$$;

create trigger guard_student_school_grade_write
  before insert or update or delete on public.student_school_grades
  for each row execute function public.guard_student_school_grade_write();

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select column_name from information_schema.columns
--     where table_name = 'student_school_grades' and column_name in ('is_locked', 'locked_at');   -- expect 2 rows
--   select tgname from pg_trigger where tgname = 'guard_student_school_grade_write';              -- expect 1 row
