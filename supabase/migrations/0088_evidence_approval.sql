-- =============================================================================
-- Kanıt Fotoğrafı, part 2: no photo limit + coach approval.
--
-- 1. Drop the 3-photo cap added in 0087 (a student can attach as many photos as
--    the work needs; every file is still compressed and capped per file).
-- 2. A task that carries evidence photos is no longer completed by the student's
--    say-so. When the student marks it done / half done, it is HELD:
--        status                 -> 'pending'
--        evidence_review_status -> 'pending'
--        evidence_pending_status-> what the student claimed ('done'|'half_done')
--    It then shows up on the coach's "Onay Bekleyen" screen (the same one student
--    self-created extra tasks use) with its photos. Onayla applies the claimed
--    status ('approved'); Reddet sends it back ('rejected', status stays pending)
--    and the student can fix the photos and submit again.
-- 3. The tamper-guard trigger is re-created so a student cannot skip the review by
--    writing the row directly: without the coach's approval a photo-backed task
--    can never be moved to done / half_done, and the review status itself is
--    coach-only (a student may only put a task into 'pending', or back to 'none'
--    after removing every photo).
--
-- NOTE on the trigger: 0077 re-created prevent_student_task_core_tampering from
-- the 0033 shape and dropped the coach-assignment / approval-field guard that
-- 0060 had added. This version is the union of 0060 and 0077 plus the evidence
-- rules, so those provenance guards apply again.
-- Idempotent: safe to run more than once.
-- =============================================================================

-- === 1. Remove the photo cap ==================================================

alter table public.student_tasks
  drop constraint if exists student_tasks_evidence_image_paths_max;

-- === 2. Review columns ========================================================

alter table public.student_tasks
  add column if not exists evidence_review_status text not null default 'none'
    check (evidence_review_status in ('none', 'pending', 'approved', 'rejected'));

alter table public.student_tasks
  add column if not exists evidence_pending_status text
    check (evidence_pending_status in ('done', 'half_done'));

-- Photo-backed tasks are approved quickly and rarely; a partial index keeps the
-- coach's "waiting for review" lookup cheap without touching normal writes.
create index if not exists student_tasks_evidence_pending_idx
  on public.student_tasks (student_id)
  where evidence_review_status = 'pending';

-- === 3. Tamper guard ==========================================================

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

    -- Core details of a coach-assigned task (0033/0077).
    if old.is_coach_assigned = true then
      if new.task_date is distinct from old.task_date
        or new.task_type is distinct from old.task_type
        or new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.course_id is distinct from old.course_id
        or new.topic_id is distinct from old.topic_id
        or new.video_links is distinct from old.video_links
        or new.student_id is distinct from old.student_id
        or new.total_count is distinct from old.total_count
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

    -- A task in the approval flow (coach-assigned, or a self-created one a coach
    -- already approved) that has photos cannot be completed without the coach's
    -- approval. Only checked when the status or the photos change, so untouched
    -- older rows never trip it.
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

-- Verification. Expect: the cap constraint gone (0 rows), the two new columns
-- (2 rows), and the trigger function body containing 'evidence_review_status'.
select conname from pg_constraint where conname = 'student_tasks_evidence_image_paths_max';

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'student_tasks'
  and column_name in ('evidence_review_status', 'evidence_pending_status')
order by column_name;

select position('evidence_review_status' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_has_evidence_rules;
