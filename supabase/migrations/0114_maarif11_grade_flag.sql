-- 11th grade ("Türkiye Yüzyılı Maarif Modeli") student flag, kept strictly
-- separate from is_maarif9 (0096) and is_maarif10 (0099) -- same pattern,
-- extended from two mutually-exclusive grades to three.
--
-- Design notes:
--   - A third boolean, NOT a change to is_maarif9/is_maarif10 or exam_type.
--     Every existing row gets is_maarif11 = false, so nothing changes for
--     any existing student.
--   - is_maarif9 / is_maarif10 / is_maarif11 are pairwise mutually exclusive:
--     the 2-way CHECK constraints from 0099 are replaced with 3-way ones on
--     both profiles and signup_requests (every existing row already
--     satisfies this, since is_maarif11 is false everywhere).
--   - Admin-only: prevent_student_system_field_tampering is recreated below
--     EXACTLY as 0099 defined it plus one extra `is_maarif11` condition.
--   - signup_requests.is_maarif11 carries the public signup choice to account
--     approval, like is_maarif9/is_maarif10. No policy/grant change needed
--     (the anon INSERT policy only checks status = 'pending').
--   - "maarif11" is added to the coach_specialization enum (profiles
--     .academic_track's type) for the same cosmetic Akademik Alan label
--     parity as 0098/0099 -- not read by any grade/curriculum logic.
--
-- Rollback:
--   alter table public.profiles drop constraint profiles_maarif_grade_exclusive;
--   alter table public.signup_requests drop constraint signup_requests_maarif_grade_exclusive;
--   alter table public.profiles drop column is_maarif11;
--   alter table public.signup_requests drop column is_maarif11;
--   (re-add the 0099 2-way CHECK constraints; re-run 0099's definition of the
--   trigger function; enum values cannot be dropped, an unused one is harmless.)

alter table public.profiles
  add column if not exists is_maarif11 boolean not null default false;

alter table public.signup_requests
  add column if not exists is_maarif11 boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_maarif_grade_exclusive;
alter table public.profiles
  add constraint profiles_maarif_grade_exclusive check (
    not (is_maarif9 and is_maarif10)
    and not (is_maarif9 and is_maarif11)
    and not (is_maarif10 and is_maarif11)
  );

alter table public.signup_requests
  drop constraint if exists signup_requests_maarif_grade_exclusive;
alter table public.signup_requests
  add constraint signup_requests_maarif_grade_exclusive check (
    not (is_maarif9 and is_maarif10)
    and not (is_maarif9 and is_maarif11)
    and not (is_maarif10 and is_maarif11)
  );

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
      or new.is_maarif11 is distinct from old.is_maarif11
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

alter type public.coach_specialization add value if not exists 'maarif11';

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select count(*) from public.profiles where is_maarif11;                                -- expect 0
--   select count(*) from public.profiles where is_maarif9 and is_maarif11;                  -- expect 0
--   select count(*) from public.profiles where is_maarif10 and is_maarif11;                 -- expect 0
