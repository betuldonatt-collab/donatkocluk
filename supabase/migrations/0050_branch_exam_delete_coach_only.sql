-- Branch exam deletion should work exactly like resource tracking:
-- students get zero delete rights (even on a self-logged branch_exam
-- row), coaches/admin delete on their behalf. Every other custom
-- (is_coach_assigned = false) task type is unaffected -- students keep
-- deleting their own "Ekstra Çalışma" entries as before.
drop policy "student_tasks_student_delete_custom" on public.student_tasks;
create policy "student_tasks_student_delete_custom"
  on public.student_tasks for delete
  to authenticated
  using (
    student_id = (select auth.uid())
    and is_coach_assigned = false
    and task_type <> 'branch_exam'
    and not is_week_locked(student_id, task_date)
  );
