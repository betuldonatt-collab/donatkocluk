-- Replaces the single video_url/video_title columns from 0015 with a
-- JSONB array so a task can carry multiple YouTube links (e.g. several
-- konu anlatımı videos for one topic_study task). No production data
-- depends on the old columns yet (this feature hasn't shipped), so a
-- straight drop-and-replace is safe. Shape: [{ "url": text, "title":
-- text | null }, ...] -- same reasoning as subject_scores' JSONB use:
-- display-only data, never filtered/aggregated on in SQL.

alter table public.student_tasks
  drop column video_url,
  drop column video_title,
  add column video_links jsonb not null default '[]'::jsonb;

create or replace function public.prevent_student_task_core_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
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
      or new.resource_id is distinct from old.resource_id
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
