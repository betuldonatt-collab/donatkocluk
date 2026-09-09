-- Phase 5 (Exam Analysis / Weak Topic Map) needs the coach's student-list
-- and student-detail pages to show the student's name -- but no policy
-- lets a coach read a profiles row other than their own yet (only
-- profiles_select_own_or_admin exists). Everything else Phase 5 needs
-- (student_tasks, student_task_topic_mistakes) already has a *_coach_all
-- policy from 0005/0006; this is the one missing piece.
create policy "profiles_select_by_coach"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = profiles.id
    )
  );
