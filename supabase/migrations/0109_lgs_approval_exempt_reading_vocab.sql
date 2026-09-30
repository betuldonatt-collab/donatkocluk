-- Bug fix: Kitap Okuma (task_type = 'reading') stopped needing the coach's
-- evidence-photo approval to complete back in migration 0107 -- it completes
-- from its own Başlangıç/Bitiş Sayfası range instead (see lib/lgs-completion.ts,
-- which already treats 'reading' and 'vocab_quiz' as exempt from the photo/
-- approval flow entirely). The DB-level tamper guard was never told the same
-- thing: prevent_student_task_core_tampering()'s "an LGS task can only be
-- completed with the coach's approval" rule (0101) fires for EVERY coach-
-- assigned/approved LGS task's done/half_done transition, with no task_type
-- exception -- including 'reading' and 'vocab_quiz', which never set
-- evidence_review_status to 'approved' at all (they never enter the photo
-- review flow in the first place). A coach-assigned Kitap Okuma task's normal
-- save was therefore always rejected at the database level with "An LGS task
-- can only be completed with the coach's approval", surfacing to the student
-- as the generic "Beklenmeyen bir hata oluştu" (updateTaskProgress's
-- dbError() wrapper swallows the real Postgres message). 'vocab_quiz' has
-- the identical gap -- its own task marks itself done directly
-- (app/student/ingilizce-quiz/actions.ts) once its word-count target is
-- reached, also without ever touching evidence_review_status -- just not yet
-- reported, since it depends on a coach-assigned vocab_quiz task actually
-- reaching its target in production.
--
-- Fix: recreate the function identically to 0101's version, except the
-- mandatory-approval completion check now skips task types that don't use
-- the evidence/approval flow at all. Everything else (photo cap, provenance
-- guards, per-photo verdicts, review note ownership, the mandatory-photo-
-- before-review-submission rule for every OTHER task type) is unchanged.
-- Idempotent: safe to run more than once.

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

    -- c. LGS: mandatory photo / results, and no completion without approval --
    -- except 'reading' (Kitap Okuma, 0107) and 'vocab_quiz' (0108), which
    -- complete from their own page-range / word-count-target data and never
    -- enter the evidence/approval flow at all, so they have nothing to wait
    -- on evidence_review_status for.
    if coalesce(v_is_lgs, false)
      and auth.role() <> 'service_role'
      and (old.is_coach_assigned or old.is_approved_by_coach)
      and new.task_type not in ('reading', 'vocab_quiz')
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

notify pgrst, 'reload schema';

-- Verification: expect true (the exemption clause is present in the live
-- function body).
select position('not in (''reading'', ''vocab_quiz'')' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_exempts_reading_and_vocab_quiz;
