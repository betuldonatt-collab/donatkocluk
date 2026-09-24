-- 9th grade ("Türkiye Yüzyılı Maarif Modeli") student flag.
--
-- Design notes:
--   - A separate boolean, NOT a new value of the public.exam_type enum.
--     exam_type stays 'YKS' | 'LGS' and every existing `examType === 'LGS'`
--     branch in the app keeps meaning exactly what it did; a 9th grader is
--     an 'YKS'-default row plus this flag, and only code that explicitly
--     checks the flag behaves differently.
--   - NOT NULL DEFAULT false: a constant default is added without rewriting
--     the table, and every existing student (LGS or YKS) gets false, so
--     nothing changes for them.
--   - Admin-only, like exam_type: prevent_student_system_field_tampering is
--     recreated below EXACTLY as 0085 defined it (it is still the latest
--     definition) plus one extra `is_maarif9` condition.
--
-- Rollback: alter table public.profiles drop column is_maarif9;
--           (and re-run 0085's definition of the trigger function).

alter table public.profiles
  add column if not exists is_maarif9 boolean not null default false;

create or replace function public.prevent_student_system_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin()
    and auth.role() <> 'service_role'
    and current_setting('app.bypass_tampering_guard', true) is distinct from 'true'
  then
    if new.coaching_start_date is distinct from old.coaching_start_date
      or new.assigned_meeting_day is distinct from old.assigned_meeting_day
      or new.remaining_sessions is distinct from old.remaining_sessions
      or new.is_active is distinct from old.is_active
      or new.exit_category is distinct from old.exit_category
      or new.exit_note is distinct from old.exit_note
      or new.exited_at is distinct from old.exited_at
      or new.total_session_quota is distinct from old.total_session_quota
      or new.admin_notes is distinct from old.admin_notes
      or new.pool_status is distinct from old.pool_status
      or new.academic_track is distinct from old.academic_track
      or new.exam_type is distinct from old.exam_type
      or new.is_maarif9 is distinct from old.is_maarif9
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select count(*) from public.profiles where is_maarif9;   -- expect 0
--   select count(*) from public.profiles;                    -- unchanged
