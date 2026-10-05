-- 7th grade: the Kanıt Fotoğrafı / coach-approval workflow, exactly as LGS has it.
--
-- Until now the database treated only exam_type = 'LGS' students as part of the workflow (0101 / 0109):
--   * prevent_student_task_core_tampering(): rule b ("only LGS students may add evidence photos") and rule c ("an LGS
--     task needs a photo, its results, and the coach's approval before it can be completed -- except 'reading' and
--     'vocab_quiz'") both read `v_is_lgs := profiles.exam_type = 'LGS'`;
--   * the storage policy task_evidence_student_insert: only an LGS student may upload to the task_evidence bucket.
-- A 7th grader is a 'YKS' exam_type row with profiles.is_maarif7 (0119), so they were refused. This migration makes
-- both places treat `exam_type = 'LGS' OR is_maarif7` as the workflow cohort. Nothing else about either changes.
--
-- The trigger function is patched IN PLACE: its live definition is read with pg_get_functiondef, the one cohort
-- expression is replaced, and the result is re-created -- so whatever the latest definition is (0109 / 0110), the
-- rest of the function stays exactly as it is. The statement aborts (and nothing changes) if that expression is not
-- found, so it can never silently do nothing. Safe to run more than once (a second run finds the expression already
-- replaced and leaves the function alone).
--
-- Existing tasks are untouched: the rules only act on a student's own status / evidence transitions from now on.
-- Parents of 7th graders do not get the LGS parent program view (0100) with this migration.
--
-- Rollback: re-run the function definition of migration 0110 and the policy of 0101.

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure);

  if position('(p.exam_type = ''LGS'' or p.is_maarif7)' in v_def) > 0 then
    raise notice 'prevent_student_task_core_tampering already includes the 7th grade; left as is.';
    return;
  end if;

  if position('select (p.exam_type = ''LGS'') into v_is_lgs' in v_def) = 0 then
    raise exception 'Unexpected prevent_student_task_core_tampering definition: cohort expression not found; nothing changed.';
  end if;

  execute replace(
    v_def,
    'select (p.exam_type = ''LGS'') into v_is_lgs',
    'select (p.exam_type = ''LGS'' or p.is_maarif7) into v_is_lgs'
  );
end;
$$;

-- Only an LGS student or a 7th grader may upload evidence photos.
drop policy if exists "task_evidence_student_insert" on storage.objects;
create policy "task_evidence_student_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task_evidence'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.student_tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.student_id = (select auth.uid())
    )
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and (p.exam_type = 'LGS' or p.is_maarif7)
    )
  );

notify pgrst, 'reload schema';

-- Verification (run after applying; expect true, true):
select position('p.is_maarif7' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_includes_7th_grade;

select exists (
  select 1 from pg_policies
  where schemaname = 'storage' and policyname = 'task_evidence_student_insert' and with_check like '%is_maarif7%'
) as upload_policy_includes_7th_grade;
