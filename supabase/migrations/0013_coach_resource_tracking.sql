-- Coach read access for the new "Kaynak Takibi" tab on the student
-- detail page. Read-only, same coach_students-join pattern as every
-- other coach policy -- coaches still can't add/edit a student's
-- resources or progress checkmarks.
create policy "student_resources_coach_read"
  on public.student_resources for select
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resources.student_id
    )
  );

create policy "student_resource_progress_coach_read"
  on public.student_resource_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resource_progress.student_id
    )
  );
