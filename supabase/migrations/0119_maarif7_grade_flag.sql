-- 7th grade ("Türkiye Yüzyılı Maarif Modeli") student flag.
--
-- Design notes (the same pattern as is_maarif9 / is_maarif10 / is_maarif11):
--   - A boolean, NOT a new exam_type value: exam_type stays 'YKS' | 'LGS' and every existing
--     branch keeps meaning what it did. A 7th grader is a 'YKS'-default row plus this flag; only
--     code that checks the flag behaves differently (no YKS countdown, no TYT/AYT tabs, no
--     Çıkmış Sorular, the 7th grade's own courses, its own Yazılılar list).
--   - NOT NULL DEFAULT false: a constant default, no table rewrite; every existing student gets
--     false and nothing changes for them.
--   - is_maarif7 / is_maarif9 / is_maarif10 / is_maarif11 are pairwise mutually exclusive, and a
--     graduate (is_graduate, 0117) is in none of them: the CHECK constraints from 0114 and 0117 are
--     replaced with versions that include is_maarif7, on both profiles and signup_requests. Every
--     existing row already satisfies them (is_maarif7 is false everywhere).
--   - Admin-only: prevent_student_system_field_tampering is recreated EXACTLY as 0117 defined it
--     (the latest definition) plus one `is_maarif7` condition.
--   - signup_requests.is_maarif7 carries the public signup choice ("7. Sınıf (Maarif)") to account
--     approval, like the other grade flags. No policy/grant change needed.
--   - "maarif7" is added to the coach_specialization enum (profiles.academic_track's type) for the
--     same cosmetic Akademik Alan label parity as 0098/0099/0114 -- not read by any grade logic.
--
-- Rollback:
--   alter table public.profiles drop constraint profiles_maarif_grade_exclusive;
--   alter table public.signup_requests drop constraint signup_requests_maarif_grade_exclusive;
--   alter table public.profiles drop constraint profiles_graduate_not_maarif;
--   alter table public.signup_requests drop constraint signup_requests_graduate_not_maarif;
--   alter table public.profiles drop column is_maarif7;
--   alter table public.signup_requests drop column is_maarif7;
--   (re-add the 0114 / 0117 constraints; re-run 0117's definition of the trigger function; enum
--   values cannot be dropped, an unused one is harmless.)

alter table public.profiles
  add column if not exists is_maarif7 boolean not null default false;

alter table public.signup_requests
  add column if not exists is_maarif7 boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_maarif_grade_exclusive;
alter table public.profiles
  add constraint profiles_maarif_grade_exclusive check (
    not (is_maarif7 and is_maarif9)
    and not (is_maarif7 and is_maarif10)
    and not (is_maarif7 and is_maarif11)
    and not (is_maarif9 and is_maarif10)
    and not (is_maarif9 and is_maarif11)
    and not (is_maarif10 and is_maarif11)
  );

alter table public.signup_requests
  drop constraint if exists signup_requests_maarif_grade_exclusive;
alter table public.signup_requests
  add constraint signup_requests_maarif_grade_exclusive check (
    not (is_maarif7 and is_maarif9)
    and not (is_maarif7 and is_maarif10)
    and not (is_maarif7 and is_maarif11)
    and not (is_maarif9 and is_maarif10)
    and not (is_maarif9 and is_maarif11)
    and not (is_maarif10 and is_maarif11)
  );

alter table public.profiles
  drop constraint if exists profiles_graduate_not_maarif;
alter table public.profiles
  add constraint profiles_graduate_not_maarif check (
    not (is_graduate and (is_maarif7 or is_maarif9 or is_maarif10 or is_maarif11))
  );

alter table public.signup_requests
  drop constraint if exists signup_requests_graduate_not_maarif;
alter table public.signup_requests
  add constraint signup_requests_graduate_not_maarif check (
    not (is_graduate and (is_maarif7 or is_maarif9 or is_maarif10 or is_maarif11))
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
      or new.is_maarif7 is distinct from old.is_maarif7
      or new.is_maarif9 is distinct from old.is_maarif9
      or new.is_maarif10 is distinct from old.is_maarif10
      or new.is_maarif11 is distinct from old.is_maarif11
      or new.is_graduate is distinct from old.is_graduate
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

alter type public.coach_specialization add value if not exists 'maarif7';

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select count(*) from public.profiles where is_maarif7;                                   -- expect 0
--   select count(*) from public.profiles where is_maarif7 and (is_maarif9 or is_maarif10 or is_maarif11 or is_graduate);  -- expect 0
--   select conname from pg_constraint where conrelid = 'public.profiles'::regclass and (conname like '%maarif%' or conname like '%graduate%');
