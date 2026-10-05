-- Yazılılar, parent side: a parent may READ the school-exam courses and grades of the student(s) linked to them
-- (parent_students, 0026). Select only -- no insert / update / delete policy is added, so a parent can edit,
-- lock or decide nothing; the Parent panel's Yazılılar page is a read-only view.
--
-- Rollback:
--   drop policy "school_courses_parent_select" on public.student_school_courses;
--   drop policy "school_grades_parent_select" on public.student_school_grades;

create policy "school_courses_parent_select" on public.student_school_courses for select to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = student_school_courses.student_id
  ));

create policy "school_grades_parent_select" on public.student_school_grades for select to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = student_school_grades.student_id
  ));

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select policyname from pg_policies
--     where policyname in ('school_courses_parent_select', 'school_grades_parent_select');   -- expect 2 rows
