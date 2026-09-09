-- 0032 dropped student_tasks.resource_id (replaced by the task_resources
-- junction table) but left this trigger function still referencing it.
-- Since "new"/"old" are generic RECORD types in a row-level trigger, the
-- bad column reference only errors at RUNTIME, not at CREATE FUNCTION
-- time -- and only once the code path reaches that specific comparison.
--
-- The outer guard (old.is_coach_assigned and not admin and the caller
-- isn't the assigned coach) is true for every STUDENT updating their own
-- coach-assigned task (status, scores, etc.) -- students are never in
-- coach_students. So every such update has been crashing with a raw
-- Postgres error ("record new has no field resource_id") instead of
-- either succeeding or raising the intended tampering exception, since
-- 0032 was applied.
--
-- Resource identity no longer lives on this row at all -- task_resources
-- has its own RLS (task_resources_coach_all) restricting writes to the
-- assigned coach, so resource_id doesn't belong in this guard's watched
-- column list any more; it's simply removed rather than replaced.
create or replace function public.prevent_student_task_core_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.is_coach_assigned = true
    and not public.is_admin()
    and not exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = old.student_id
    )
  then
    if new.task_date is distinct from old.task_date
      or new.task_type is distinct from old.task_type
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.course_id is distinct from old.course_id
      or new.topic_id is distinct from old.topic_id
      or new.video_links is distinct from old.video_links
      or new.coach_id is distinct from old.coach_id
      or new.student_id is distinct from old.student_id
      or new.is_coach_assigned is distinct from old.is_coach_assigned
    then
      raise exception 'Only the assigning coach can change a coach-assigned task''s core details';
    end if;
  end if;
  return new;
end;
$$;
