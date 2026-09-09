-- Private admin-only notes on a student (e.g. "left for another course,
-- do not call").
alter table public.profiles add column admin_notes text;

-- Timestamp of the last pool_status change, so the pool UI can show how
-- long a student has actually been passive. Defaults to now() so a
-- freshly-created ('new') student's passive clock starts at signup.
alter table public.profiles add column pool_status_changed_at timestamptz not null default now();

-- Closing a gap from 0027: pool_status was left OUT of the guarded-field
-- list there so the auto-unassign trigger (which runs under the calling
-- COACH's own session, not admin) could still write it. That
-- accidentally left it writable by a student on their OWN row too, since
-- profiles_update_own has no column restriction. Fixed here by adding it
-- to the guard and giving the auto-unassign trigger a narrow, explicit
-- bypass instead of leaving the field unguarded for everyone.
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
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

-- Keep pool_status_changed_at in lockstep with pool_status everywhere it
-- changes (the admin's manual sendToPool action, and the automated
-- quota-completion trigger) without needing every caller to remember to
-- set it themselves.
create or replace function public.touch_pool_status_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.pool_status is distinct from old.pool_status then
    new.pool_status_changed_at = now();
  end if;
  return new;
end;
$$;
create trigger profiles_touch_pool_status_changed_at
  before update on public.profiles
  for each row execute function public.touch_pool_status_changed_at();

-- Sets the same session-local flag prevent_student_system_field_tampering
-- now checks, scoped to just this transaction (the `true` third argument
-- to set_config), so the bypass never leaks beyond this one trigger's
-- own write.
create or replace function public.auto_unassign_on_quota_completion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_quota int;
  v_completed int;
begin
  if new.outcome <> 'completed' or (old.outcome is not null and old.outcome = 'completed') then
    return new;
  end if;

  select total_session_quota into v_quota from public.profiles where id = new.student_id;
  if v_quota is null or v_quota <= 0 then
    return new;
  end if;

  select count(*) into v_completed from public.coaching_sessions
    where student_id = new.student_id and outcome = 'completed';

  if v_completed >= v_quota then
    delete from public.coach_students where student_id = new.student_id;
    perform set_config('app.bypass_tampering_guard', 'true', true);
    update public.profiles set pool_status = 'quota_completed' where id = new.student_id;
  end if;

  return new;
end;
$$;
