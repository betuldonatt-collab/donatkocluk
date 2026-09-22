-- Genel Deneme's total_count is never a coach-set target -- it's always
-- null at assignment (taskFormValueToPayload's general_exam branch) and is
-- instead a rollup the student's own per-subject scores recompute on every
-- save (buildCountsPatch's showSubjectScores branch, task-modal.tsx).
-- 0077's "core details of a coach-assigned task" lock treated it as if it
-- were a real coach target like question_bank/branch_exam's Toplam, so it
-- rejected every legitimate Genel Deneme save after the first one with
-- "Only the assigning coach can change a coach-assigned task's core
-- details" -- surfaced to the student as a confusing, wrongly-worded error
-- (fixed app-side in the same change to app/student/actions.ts). This
-- restates 0089's function with one added exception: total_count stays
-- locked for every other task_type, but not for general_exam.

create or replace function public.prevent_student_task_core_tampering()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';

-- Verification: confirm the function body now carries the general_exam
-- exception (expect true).
select position('general_exam''' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_excludes_general_exam_total_count;
