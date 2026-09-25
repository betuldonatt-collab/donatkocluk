-- 10th grade ("Türkiye Yüzyılı Maarif Modeli") student flag, kept strictly
-- separate from the 9th grade's is_maarif9 (0096).
--
-- Design notes:
--   - A second boolean, NOT a change to is_maarif9 or exam_type. Every
--     existing student (LGS, YKS, 9th grade) gets is_maarif10 = false, so
--     nothing changes for them; a 10th grader is a YKS-default row plus this
--     flag, exactly like a 9th grader is with is_maarif9.
--   - is_maarif9 and is_maarif10 are mutually exclusive: a CHECK constraint on
--     profiles and on signup_requests enforces it, so a student can never see
--     both grades' curricula. (Every existing row has is_maarif10 = false, so
--     the constraint is satisfied by all of them.)
--   - Admin-only: prevent_student_system_field_tampering is recreated below
--     EXACTLY as 0096 defined it plus one extra `is_maarif10` condition.
--   - signup_requests.is_maarif10 carries the public signup choice to account
--     approval, like signup_requests.is_maarif9 (0097). No policy/grant change
--     is needed (the anon INSERT policy only checks status = 'pending').
--   - "maarif10" is added to the coach_specialization enum (profiles
--     .academic_track's type, see 0029/0098) so the admin can pick
--     "10. Sınıf" as a student's Akademik Alan. ADD VALUE only appends; it is
--     not used later in this file (Postgres 12+ allows it inside a
--     transaction on that condition).
--
-- Rollback:
--   alter table public.profiles drop constraint profiles_maarif_grade_exclusive;
--   alter table public.signup_requests drop constraint signup_requests_maarif_grade_exclusive;
--   alter table public.profiles drop column is_maarif10;
--   alter table public.signup_requests drop column is_maarif10;
--   (and re-run 0096's definition of the trigger function; enum values cannot
--   be dropped, an unused one is harmless.)

alter table public.profiles
  add column if not exists is_maarif10 boolean not null default false;

alter table public.signup_requests
  add column if not exists is_maarif10 boolean not null default false;

alter table public.profiles
  add constraint profiles_maarif_grade_exclusive check (not (is_maarif9 and is_maarif10));

alter table public.signup_requests
  add constraint signup_requests_maarif_grade_exclusive check (not (is_maarif9 and is_maarif10));

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
      or new.is_maarif10 is distinct from old.is_maarif10
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

alter type public.coach_specialization add value if not exists 'maarif10';

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select count(*) from public.profiles where is_maarif10;                 -- expect 0
--   select count(*) from public.profiles where is_maarif9 and is_maarif10;  -- expect 0
