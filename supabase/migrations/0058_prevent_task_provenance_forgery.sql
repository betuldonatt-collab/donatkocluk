-- Security audit finding (Medium): prevent_student_task_core_tampering
-- only guarded is_coach_assigned/coach_id when OLD.is_coach_assigned was
-- already true -- a student's own self-created task (is_coach_assigned
-- = false) had no protection at all, so a direct RLS-permitted UPDATE
-- could flip it to is_coach_assigned: true with an arbitrary coach_id,
-- forging a task's provenance. This replaces the trigger with a
-- strictly broader one: a student can NEVER set is_coach_assigned or
-- coach_id to anything, on any of their own rows, regardless of the
-- row's prior state -- those two fields are coach/admin-only, always.
-- Every other guarded field (task_date/task_type/title/description/
-- course_id/topic_id/video_links/student_id) keeps the exact same
-- "only when the row is already coach-assigned" protection as before.
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
    if new.is_coach_assigned is distinct from old.is_coach_assigned
      or new.coach_id is distinct from old.coach_id
    then
      raise exception 'Only a coach can change a task''s coach-assignment fields';
    end if;

    if old.is_coach_assigned = true then
      if new.task_date is distinct from old.task_date
        or new.task_type is distinct from old.task_type
        or new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.course_id is distinct from old.course_id
        or new.topic_id is distinct from old.topic_id
        or new.video_links is distinct from old.video_links
        or new.student_id is distinct from old.student_id
      then
        raise exception 'Only the assigning coach can change a coach-assigned task''s core details';
      end if;
    end if;
  end if;
  return new;
end;
$function$;
