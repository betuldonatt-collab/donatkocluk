-- Parent panel, LGS only: read access for the full program view.
--
-- A parent of an LGS student gets a read-only "Tam Program" page (weekly board,
-- Sabit Görevler, Rutinler, task results, evidence photos). Parents can already
-- read that student's student_tasks rows (0026 student_tasks_parent_read); what
-- was missing is everything the page shows around them:
--
--   - student_fixed_tasks   the recurring weekly skeleton (Sabit Görevler)
--   - task_resources        which book/kaynak a task was assigned from
--   - student_resources     those resources' names
--   - storage.objects       the private `task_evidence` bucket (evidence photos,
--                           served to the parent as short-lived signed URLs)
--
-- Every policy below is SELECT-only and is scoped twice:
--   1. the parent must be linked to the student (parent_students), and
--   2. that student must be an LGS student (profiles.exam_type = 'LGS').
-- So a parent of a YKS / 9th-grade / 10th-grade student gets no new access at
-- all -- not even through the API -- and nothing else about any policy, grant,
-- table or existing row changes. profiles is readable to a linked parent
-- through the existing profiles_select_by_parent policy, so the exam_type
-- lookup inside these policies works for them.
--
-- Idempotent: each policy is dropped-if-exists before it is created.
--
-- Rollback: drop the four policies named below.

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
        and p.exam_type = 'LGS'
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
        and p.exam_type = 'LGS'
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
        and p.exam_type = 'LGS'
    )
  );

-- Evidence photos live at <student_id>/<task_id>/<file> (0087), so the first
-- folder segment is the student the photo belongs to.
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
        and p.exam_type = 'LGS'
    )
  );

notify pgrst, 'reload schema';

-- Verification (run after applying; expect the four policy names back):
--   select policyname from pg_policies
--   where policyname in (
--     'student_fixed_tasks_parent_read_lgs', 'task_resources_parent_read_lgs',
--     'student_resources_parent_read_lgs', 'task_evidence_parent_select_lgs'
--   ) order by policyname;
