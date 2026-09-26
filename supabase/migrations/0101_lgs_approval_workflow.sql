-- LGS approval workflow, database side.
--
-- What changes, and only for what it should:
--
--   1. student_tasks.evidence_review_note  -- the coach's OPTIONAL reason when
--      rejecting a task (shown to the student and, for LGS, to the parent).
--      Nullable: a coach is never forced to write one.
--
--   2. prevent_student_task_core_tampering() is recreated EXACTLY as 0093
--      defined it, plus these extra rules (all of them only bind a STUDENT's own
--      writes; coaches and admins are exempt, as before):
--        a. the review note is the coach's: a student cannot write it;
--        b. only an LGS student may ADD evidence photos -- YKS / 9th / 10th-grade
--           students can no longer attach photos at all;
--        c. for an LGS student, a coach-assigned (or coach-approved) task cannot
--           be marked done / half done without the coach's approval, and cannot
--           be sent for review without >= 1 photo and -- for Soru Çözümü, Branş
--           Denemesi and Genel Deneme -- its Doğru/Yanlış/Boş results.
--      Rule c is skipped for service-role connections.
--
--   3. The storage policy that lets a student upload into `task_evidence` now also
--      requires an LGS student (belt and braces for rule b).
--
-- Nothing changes for existing YKS / 9th / 10th-grade students' completion flow:
-- they still complete tasks immediately.
--
-- Rollback: drop the column; re-run 0093's trigger function and 0087's
-- task_evidence_student_insert policy.

alter table public.student_tasks
  add column if not exists evidence_review_note text
    check (evidence_review_note is null or length(evidence_review_note) <= 500);

create or replace function public.prevent_student_task_core_tampering()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_lgs boolean;
begin
  if not public.is_admin()
    and not exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = old.student_id
    )
  then
    -- Provenance (0058/0060): only a coach decides who assigned/approved a task.
    if new.is_coach_assigned is distinct from old.is_coach_assigned
      or new.coach_id is distinct from old.coach_id
      or new.is_approved_by_coach is distinct from old.is_approved_by_coach
    then
      raise exception 'Only a coach can change a task''s coach-assignment/approval fields';
    end if;

    -- Core details of a coach-assigned task (0033/0077). total_count is
    -- excluded for general_exam (0093): it is always student-derived for
    -- that type, never a coach-set target.
    if old.is_coach_assigned = true then
      if new.task_date is distinct from old.task_date
        or new.task_type is distinct from old.task_type
        or new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.course_id is distinct from old.course_id
        or new.topic_id is distinct from old.topic_id
        or new.video_links is distinct from old.video_links
        or new.student_id is distinct from old.student_id
        or (old.task_type <> 'general_exam' and new.total_count is distinct from old.total_count)
      then
        raise exception 'Only the assigning coach can change a coach-assigned task''s core details';
      end if;
    end if;

    -- Evidence review (0088): approved / rejected are the coach's call.
    if new.evidence_review_status is distinct from old.evidence_review_status then
      if not (
        new.evidence_review_status = 'pending'
        or (new.evidence_review_status = 'none' and cardinality(new.evidence_image_paths) = 0)
      ) then
        raise exception 'Only a coach can approve or reject evidence photos';
      end if;
    end if;

    -- Per-photo verdicts (0089): a student can drop entries, never add or change.
    if not (old.evidence_photo_status @> new.evidence_photo_status) then
      raise exception 'Only a coach can approve or reject individual evidence photos';
    end if;

    -- The coach's rejection note (0101) is the coach's alone.
    if new.evidence_review_note is distinct from old.evidence_review_note then
      raise exception 'Only a coach can write the review note';
    end if;

    -- A photo-backed task in the approval flow cannot be completed without approval.
    if (old.is_coach_assigned or old.is_approved_by_coach)
      and cardinality(new.evidence_image_paths) > 0
      and new.evidence_review_status <> 'approved'
      and new.status in ('done', 'half_done')
      and (new.status is distinct from old.status
           or new.evidence_image_paths is distinct from old.evidence_image_paths)
    then
      raise exception 'A task with evidence photos needs the coach''s approval before it can be completed';
    end if;

    -- 0101: cohort rules (a student's own writes only).
    select (p.exam_type = 'LGS') into v_is_lgs from public.profiles p where p.id = old.student_id;

    -- b. only LGS students may add evidence photos.
    if cardinality(new.evidence_image_paths) > cardinality(old.evidence_image_paths)
      and coalesce(v_is_lgs, false) = false
    then
      raise exception 'Evidence photos are only available to LGS students';
    end if;

    -- c. LGS: mandatory photo / results, and no completion without approval.
    if coalesce(v_is_lgs, false)
      and auth.role() <> 'service_role'
      and (old.is_coach_assigned or old.is_approved_by_coach)
    then
      if new.status in ('done', 'half_done')
        and new.status is distinct from old.status
        and new.evidence_review_status <> 'approved'
      then
        raise exception 'An LGS task can only be completed with the coach''s approval';
      end if;

      if new.evidence_review_status = 'pending'
        and new.evidence_review_status is distinct from old.evidence_review_status
      then
        if cardinality(new.evidence_image_paths) < 1 then
          raise exception 'An LGS task needs at least one evidence photo before it can be sent for approval';
        end if;
        if new.task_type in ('question_bank', 'branch_exam')
          and (new.correct_count is null or new.wrong_count is null or new.empty_count is null)
        then
          raise exception 'Doğru, yanlış and boş counts are required before this task can be sent for approval';
        end if;
        if new.task_type = 'general_exam'
          and (new.subject_scores is null or new.subject_scores = '{}'::jsonb)
        then
          raise exception 'Genel deneme results are required before this task can be sent for approval';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- Only an LGS student may upload evidence photos.
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
      where p.id = (select auth.uid()) and p.exam_type = 'LGS'
    )
  );

notify pgrst, 'reload schema';

-- Verification (run after applying; expect: 1 row, true, 1 row):
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'student_tasks' and column_name = 'evidence_review_note';

select position('evidence_review_note' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_has_note_and_lgs_rules;

select policyname from pg_policies where schemaname = 'storage' and policyname = 'task_evidence_student_insert';
