-- Product-gap audit finding: Karne v2 (report cards) has zero parent-facing
-- surface anywhere -- a paying parent has no way to see the single most
-- relevant artifact of their child's whole coaching cycle. Same
-- parent_students-join + approved-only shape as the student's own read
-- policy (student_report_cards_student_read) and every other parent_read
-- policy in this schema (student_tasks_parent_read, coach_notes_parent_read,
-- etc.) -- drafts stay invisible to parents exactly like they do to students.
create policy "student_report_cards_parent_read" on public.student_report_cards for select
  to authenticated
  using (
    status = 'approved'
    and exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = student_report_cards.student_id
    )
  );
