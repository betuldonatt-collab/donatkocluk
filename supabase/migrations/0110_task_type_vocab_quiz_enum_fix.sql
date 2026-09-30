-- Root cause of "Odak süresi kaydedilemedi (hata kodu: 22P02)" on Süre Tut,
-- and of Ders Atama silently failing to create an İngilizce Kelime Quizi
-- task in the first place: public.task_type (the enum backing
-- student_tasks.task_type, created in 0005) was NEVER given a 'vocab_quiz'
-- label. Migration 0108 (LGS Vocab Quiz Phase 3) started writing
-- task_type = 'vocab_quiz' everywhere in application code (app/coach/
-- actions.ts's assignTask/updateAssignedTask, app/student/ingilizce-quiz/
-- actions.ts's getActiveVocabQuizTask) without ever running
-- `alter type public.task_type add value 'vocab_quiz'` -- an oversight in
-- that migration, invisible until something actually tried to use the
-- literal.
--
-- 0109 (this session, fixing the Kitap Okuma completion bug) made that
-- invisible gap load-bearing: its recreated prevent_student_task_core_
-- tampering() trigger added `new.task_type not in ('reading', 'vocab_quiz')`
-- to the mandatory-approval check. Postgres has to cast every literal in
-- that list to task_type to do the comparison -- and 'vocab_quiz' has no
-- such label, so the cast raises 22P02 (invalid_text_representation) the
-- instant that line is reached. It's reached on EVERY update to a coach-
-- assigned/approved task belonging to an LGS student, regardless of that
-- task's own type -- including Süre Tut's end_focus_session RPC, which only
-- touches tracked_duration_seconds on an otherwise-unrelated task, but still
-- fires this same BEFORE UPDATE trigger like any other write to the row.
--
-- Two independent fixes, both needed:
--   1. Actually add the missing enum label, so a vocab_quiz task can be
--      created/updated as application code has assumed since 0108.
--   2. Recreate the trigger comparing new.task_type::text against plain text
--      literals instead of relying on an implicit enum cast -- so a future
--      task_type introduced in application code before its enum label lands
--      fails loudly at the one INSERT/UPDATE that actually needs it, instead
--      of silently breaking every OTHER update on every OTHER row that
--      happens to reach this same comparison.
-- Idempotent: safe to run more than once.

alter type public.task_type add value if not exists 'vocab_quiz';

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
    -- enter the evidence/approval flow at all. Cast to text explicitly (see
    -- this migration's own comment) so this line can never fail the whole
    -- update over an enum label mismatch again.
    if coalesce(v_is_lgs, false)
      and auth.role() <> 'service_role'
      and (old.is_coach_assigned or old.is_approved_by_coach)
      and new.task_type::text not in ('reading', 'vocab_quiz')
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

-- Verification: expect true, true.
select exists (
  select 1 from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'task_type' and e.enumlabel = 'vocab_quiz'
) as vocab_quiz_enum_label_exists;

select position('task_type::text not in' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_uses_text_cast;
