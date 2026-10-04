-- "Mezun" (graduate) student flag.
--
-- Why: nothing in the profile told a 12th grader from a graduate -- both are an
-- exam_type = 'YKS' row with no Maarif flag. Graduates take no school exams, so the
-- student panel hides "Yazılılar" for them; that needs a real marker.
--
-- Design notes (same pattern as is_maarif9 / is_maarif10 / is_maarif11):
--   - A boolean, NOT a new exam_type value: exam_type stays 'YKS' | 'LGS' and every
--     existing `examType === 'LGS'` / YKS branch keeps meaning what it did. A
--     graduate is a plain 'YKS' row plus this flag; only code that checks the flag
--     behaves differently.
--   - NOT NULL DEFAULT false: a constant default, no table rewrite, every existing
--     student gets false and nothing changes for them.
--   - Mutually exclusive with the Maarif grades (a graduate is not in 9th/10th/11th
--     grade): CHECK constraints on profiles and signup_requests. Every existing row
--     already satisfies them (is_graduate is false everywhere).
--   - Admin-only: prevent_student_system_field_tampering is recreated EXACTLY as
--     0114 defined it (still the latest definition) plus one `is_graduate` condition.
--   - signup_requests.is_graduate carries the public signup choice ("Mezun") to
--     account approval, like the Maarif flags. No policy/grant change needed.
--
-- Rollback:
--   alter table public.profiles drop constraint profiles_graduate_not_maarif;
--   alter table public.signup_requests drop constraint signup_requests_graduate_not_maarif;
--   alter table public.profiles drop column is_graduate;
--   alter table public.signup_requests drop column is_graduate;
--   (re-run 0114's definition of the trigger function.)

alter table public.profiles
  add column if not exists is_graduate boolean not null default false;

alter table public.signup_requests
  add column if not exists is_graduate boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_graduate_not_maarif;
alter table public.profiles
  add constraint profiles_graduate_not_maarif check (
    not (is_graduate and (is_maarif9 or is_maarif10 or is_maarif11))
  );

alter table public.signup_requests
  drop constraint if exists signup_requests_graduate_not_maarif;
alter table public.signup_requests
  add constraint signup_requests_graduate_not_maarif check (
    not (is_graduate and (is_maarif9 or is_maarif10 or is_maarif11))
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
      or new.is_graduate is distinct from old.is_graduate
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

-- The three students the coach named as graduates. Matched by exact name
-- (case-insensitive) and only if they are plain YKS students (not LGS, not a
-- Maarif grade), which the constraint above requires anyway. The guard bypass is
-- transaction-local, so it affects nothing else.
select set_config('app.bypass_tampering_guard', 'true', true);

update public.profiles
set is_graduate = true
where role = 'student'
  and exam_type = 'YKS'
  and not is_maarif9
  and not is_maarif10
  and not is_maarif11
  and lower(trim(full_name)) in ('alperen küçük', 'züleyha akbaş', 'sukeyna ortahisar');

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   -- expect exactly 3 rows, all is_graduate = true (if fewer, the name differs in the
--   -- database, or the student is LGS / a Maarif grade -- check the next query):
--   select full_name, exam_type, is_maarif9, is_maarif10, is_maarif11, is_graduate
--     from public.profiles where is_graduate;
--   select full_name, exam_type, is_maarif9, is_maarif10, is_maarif11, is_graduate
--     from public.profiles
--     where lower(trim(full_name)) in ('alperen küçük', 'züleyha akbaş', 'sukeyna ortahisar');
--   select count(*) from public.profiles where is_graduate and (is_maarif9 or is_maarif10 or is_maarif11);  -- expect 0
