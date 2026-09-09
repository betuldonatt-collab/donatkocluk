-- Lets a student link a resource to their own self-logged task (the new
-- "Ek Çalışma Ekle" rich form) -- task_resources previously had only
-- admin_all/coach_all/student_read, no student write policy at all, so
-- this insert was silently rejected by RLS. Scoped identically to
-- student_tasks_student_insert_custom (own task, never a coach-assigned
-- one) so a student still can't attach resources to a coach's task.
create policy "task_resources_student_insert" on public.task_resources for insert
  to authenticated
  with check (exists (
    select 1 from public.student_tasks st
    where st.id = task_resources.task_id
      and st.student_id = (select auth.uid())
      and st.is_coach_assigned = false
  ));

create policy "task_resources_student_delete" on public.task_resources for delete
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    where st.id = task_resources.task_id
      and st.student_id = (select auth.uid())
      and st.is_coach_assigned = false
  ));

notify pgrst, 'reload schema';
