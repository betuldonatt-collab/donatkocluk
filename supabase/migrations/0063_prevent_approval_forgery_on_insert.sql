-- Security audit finding (High): is_approved_by_coach (0059) gates whether
-- a student's self-created task counts toward Kaynak Takibi/Gelişim
-- Haritası/Karne -- see that migration's own comment. The tamper-guard
-- trigger (0060, prevent_student_task_core_tampering) only fires BEFORE
-- UPDATE, and this INSERT policy's own WITH CHECK never mentioned the
-- column at all -- so a student could `insert({ is_coach_assigned: false,
-- is_approved_by_coach: true, ... })` directly via the Supabase client
-- (createRichCustomTask never sets this field, so it provided no real
-- protection either) and have their unreviewed self-reported data appear
-- everywhere as coach-vetted history. Same bug class already fixed once
-- for student_daily_stats (0057) -- never applied to this newer column.
drop policy "student_tasks_student_insert_custom" on public.student_tasks;

create policy "student_tasks_student_insert_custom" on public.student_tasks for insert
  to authenticated
  with check (
    student_id = (select auth.uid())
    and is_coach_assigned = false
    and is_approved_by_coach = false
    and not is_week_locked(student_id, task_date)
  );
