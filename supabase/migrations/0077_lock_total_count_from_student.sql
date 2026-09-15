-- Extends prevent_student_task_core_tampering (0033) to also protect
-- total_count -- the "Toplam" a coach assigns when creating a task must
-- not be editable by the student; only their actual solved counts
-- (Doğru/Yanlış/Boş) are theirs to change. Same shape as every other
-- field this trigger already guards: blocked only when the row is
-- coach-assigned and the caller isn't the assigning coach (or an admin),
-- so a coach editing their own assigned task's target, or a student
-- editing a self-created task's own Toplam, are both unaffected.
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
      or new.total_count is distinct from old.total_count
    then
      raise exception 'Only the assigning coach can change a coach-assigned task''s core details';
    end if;
  end if;
  return new;
end;
$$;
