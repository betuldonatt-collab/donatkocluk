-- Parent panel, 7th grade: the same read access to the full program view ("Tam Program") that the parent of an LGS
-- student has (0100).
--
-- 0100 scoped four SELECT policies to parents of LGS students (profiles.exam_type = 'LGS'). A 7th grader is a 'YKS'
-- exam_type row with profiles.is_maarif7 (0119), and now follows the LGS photo / coach-approval workflow (0123), so
-- their parent must see the same things: Sabit Görevler, the resources a task was assigned from, and the evidence
-- photos (with the coach's rejections, which live on student_tasks -- already readable to a linked parent, 0026).
--
-- Each policy below is the 0100 policy with `p.exam_type = 'LGS'` widened to `(p.exam_type = 'LGS' or p.is_maarif7)`.
-- They stay SELECT-only and scoped twice (the parent must be linked to the student, and the student must be an LGS
-- student or a 7th grader), so a parent of any other cohort (YKS, 9th, 10th, 11th grade) still gets no new access.
--
-- Idempotent: each policy is dropped-if-exists before it is created.
-- Rollback: re-run migration 0100.

drop policy if exists "student_fixed_tasks_parent_read_lgs" on public.student_fixed_tasks;
create policy "student_fixed_tasks_parent_read_lgs" on public.student_fixed_tasks for select
  to authenticated
  using (
    exists (
      select 1
      from public.parent_students ps
      join public.profiles p on p.id = ps.student_id
      where ps.parent_id = (select auth.uid())
        and ps.student_id = student_fixed_tasks.student_id
        and (p.exam_type = 'LGS' or p.is_maarif7)
    )
  );

drop policy if exists "task_resources_parent_read_lgs" on public.task_resources;
create policy "task_resources_parent_read_lgs" on public.task_resources for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_tasks t
      join public.parent_students ps on ps.student_id = t.student_id
      join public.profiles p on p.id = t.student_id
      where t.id = task_resources.task_id
        and ps.parent_id = (select auth.uid())
        and (p.exam_type = 'LGS' or p.is_maarif7)
    )
  );

drop policy if exists "student_resources_parent_read_lgs" on public.student_resources;
create policy "student_resources_parent_read_lgs" on public.student_resources for select
  to authenticated
  using (
    exists (
      select 1
      from public.parent_students ps
      join public.profiles p on p.id = ps.student_id
      where ps.parent_id = (select auth.uid())
        and ps.student_id = student_resources.student_id
        and (p.exam_type = 'LGS' or p.is_maarif7)
    )
  );

-- Evidence photos live at <student_id>/<task_id>/<file> (0087), so the first folder segment is the student the
-- photo belongs to.
drop policy if exists "task_evidence_parent_select_lgs" on storage.objects;
create policy "task_evidence_parent_select_lgs" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task_evidence'
    and exists (
      select 1
      from public.parent_students ps
      join public.profiles p on p.id = ps.student_id
      where ps.parent_id = (select auth.uid())
        and ps.student_id::text = (storage.foldername(name))[1]
        and (p.exam_type = 'LGS' or p.is_maarif7)
    )
  );

notify pgrst, 'reload schema';

-- Verification (run after applying; expect 4 rows, all true):
--   select policyname, (qual like '%is_maarif7%') as includes_7th_grade
--   from pg_policies
--   where policyname in (
--     'student_fixed_tasks_parent_read_lgs', 'task_resources_parent_read_lgs',
--     'student_resources_parent_read_lgs', 'task_evidence_parent_select_lgs'
--   ) order by policyname;
