-- "Kaynak Sil" must be coach-only: a student's own resources are no
-- longer deletable by the student at the RLS level, only by their coach
-- (student_resources_coach_delete, from 0014). student_resources_own was
-- "for all" (select/insert/update/delete bundled) -- split it into the
-- three operations students still need, dropping delete entirely. No
-- student-side UI calls delete today, so this only closes an unused
-- DB-level permission; it does not change any student-facing behavior.

drop policy "student_resources_own" on public.student_resources;

create policy "student_resources_own_select"
  on public.student_resources for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "student_resources_own_insert"
  on public.student_resources for insert
  to authenticated
  with check (student_id = (select auth.uid()));

create policy "student_resources_own_update"
  on public.student_resources for update
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
