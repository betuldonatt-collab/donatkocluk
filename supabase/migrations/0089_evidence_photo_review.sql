-- =============================================================================
-- Kanıt Fotoğrafı, part 3: the coach reviews EACH photo.
--
-- student_tasks.evidence_photo_status  jsonb map  <storage path> -> 'approved' |
-- 'rejected'. A path that is not in the map is still waiting for review.
-- evidence_image_paths (0087) stays the one list of a task's photos -- Storage keys
-- and the bucket policies keep pointing at it -- so nothing about uploading or
-- viewing changes; this column only adds the per-photo verdict.
--
-- The task-level evidence_review_status (0088) is now the SUMMARY of those
-- verdicts, maintained by the coach's server actions:
--     any photo rejected           -> 'rejected'  (task sent back, not completed)
--     every photo approved         -> 'approved'  (the student's claimed status applies)
--     otherwise                    -> stays 'pending'
--
-- Trigger: a student may only ever REMOVE entries from the map (deleting a photo,
-- or clearing a rejected verdict when they resubmit) -- never add or change one.
-- Only a coach or admin sets 'approved' / 'rejected'.
-- Idempotent: safe to run more than once.
-- =============================================================================

-- === 1. Column ===============================================================

alter table public.student_tasks
  add column if not exists evidence_photo_status jsonb not null default '{}'::jsonb;

alter table public.student_tasks
  drop constraint if exists student_tasks_evidence_photo_status_object;
alter table public.student_tasks
  add constraint student_tasks_evidence_photo_status_object
  check (jsonb_typeof(evidence_photo_status) = 'object');

-- === 2. Backfill (BEFORE the trigger below is replaced) ======================
-- Tasks reviewed under the old all-or-nothing rule: give every photo the verdict
-- the task got. Runs while the 0088 trigger is still in place; that version does
-- not look at this column.

update public.student_tasks
set evidence_photo_status = (
      select coalesce(jsonb_object_agg(p, 'approved'), '{}'::jsonb) from unnest(evidence_image_paths) as p
    )
where evidence_review_status = 'approved'
  and cardinality(evidence_image_paths) > 0
  and evidence_photo_status = '{}'::jsonb;

update public.student_tasks
set evidence_photo_status = (
      select coalesce(jsonb_object_agg(p, 'rejected'), '{}'::jsonb) from unnest(evidence_image_paths) as p
    )
where evidence_review_status = 'rejected'
  and cardinality(evidence_image_paths) > 0
  and evidence_photo_status = '{}'::jsonb;

-- === 3. Tamper guard =========================================================
-- 0088's function plus one rule: a student's new map must be contained in the old
-- one (same keys, same verdicts, possibly fewer).

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

-- Verification. Expect: 1 row for the column; 0 rows for tasks whose photo status
-- disagrees with an approved/rejected task verdict (the backfill worked); and true.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'student_tasks' and column_name = 'evidence_photo_status';

select count(*) as unbackfilled_reviewed_tasks
from public.student_tasks
where evidence_review_status in ('approved', 'rejected')
  and cardinality(evidence_image_paths) > 0
  and evidence_photo_status = '{}'::jsonb;

select position('evidence_photo_status' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_has_photo_rules;
