-- Coach WRITE access for the "Kaynak Takibi" tab -- coaches can now add
-- resources and toggle progress on behalf of a student, not just view.
-- Same coach_students-join pattern as every other coach write policy
-- (e.g. student_tasks_coach_all). Additive only: the student's own
-- "_own" policies are untouched.

create policy "student_resources_coach_insert"
  on public.student_resources for insert
  to authenticated
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resources.student_id
    )
  );

create policy "student_resources_coach_update"
  on public.student_resources for update
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resources.student_id
    )
  )
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resources.student_id
    )
  );

create policy "student_resources_coach_delete"
  on public.student_resources for delete
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resources.student_id
    )
  );

create policy "student_resource_progress_coach_insert"
  on public.student_resource_progress for insert
  to authenticated
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resource_progress.student_id
    )
  );

create policy "student_resource_progress_coach_update"
  on public.student_resource_progress for update
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resource_progress.student_id
    )
  )
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resource_progress.student_id
    )
  );

create policy "student_resource_progress_coach_delete"
  on public.student_resource_progress for delete
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_resource_progress.student_id
    )
  );

-- student_resource_progress never had a delete grant at all (table-level,
-- blocks every role, not just coaches) -- add it so the delete policy
-- above can take effect.
grant delete on public.student_resource_progress to authenticated;
