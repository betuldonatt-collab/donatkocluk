-- Presence for students, mirroring coach_profiles.last_active_at --
-- students have no side table of their own (all their fields already
-- live directly on profiles), so this is a plain column here. Distinct
-- from the coach mechanism (which stays on coach_profiles, untouched) --
-- two separate presence columns for two separate roles, not a shared one.
alter table public.profiles add column last_active_at timestamptz;

-- Academic track/branch, reusing coach_specialization's exact values
-- (yks_sayisal / yks_ea / yks_sozel / yks_ydt / lgs_ortaokul) -- the same
-- categories a student needs, already defined, no need for a near-duplicate
-- enum.
alter table public.profiles add column academic_track public.coach_specialization;

-- Admin-only classification field (drives the admin directory/coach
-- matching), added to the existing system-field guard -- same reasoning
-- as pool_status/admin_notes in 0027/0028. last_active_at is deliberately
-- NOT added here: it's a self-set presence heartbeat, same as coaches'.
create or replace function public.prevent_student_system_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() and current_setting('app.bypass_tampering_guard', true) is distinct from 'true' then
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
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;
