-- Why a student sits unassigned in the pool -- 'new' covers both a
-- self-registered signup and any student who has simply never had a
-- coach yet (account-provenance itself isn't tracked anywhere, so this
-- column answers "why unassigned", not "how created").
create type public.student_pool_status as enum ('new', 'quota_completed', 'absenteeism');
alter table public.profiles add column pool_status public.student_pool_status not null default 'new';

-- Coach directory fields. max_students is admin-controlled capacity;
-- last_active_at is a lightweight presence signal touched by the coach's
-- own client on every /coach page load (self-writable, NOT admin-only).
alter table public.coach_profiles add column max_students int not null default 20;
alter table public.coach_profiles add column last_active_at timestamptz;

-- max_students admin-only guard, same pattern as
-- prevent_student_system_field_tampering (0009/0021/0026).
create or replace function public.prevent_coach_profile_admin_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.max_students is distinct from old.max_students then
      raise exception 'Only an admin can change a coach''s capacity';
    end if;
  end if;
  return new;
end;
$$;
create trigger coach_profiles_prevent_admin_field_tampering
  before update on public.coach_profiles
  for each row execute function public.prevent_coach_profile_admin_field_tampering();

-- Auto-unassign on quota completion. Fires after a session is marked
-- completed (the normal coach action); runs as the migration owner so it
-- can delete coach_students / update profiles.pool_status even though
-- the calling session is the coach's own (both are normally
-- admin-only writes). Guarded so it only fires once per student (no-ops
-- if already unassigned) and only when an admin has actually set a quota.
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
    update public.profiles set pool_status = 'quota_completed' where id = new.student_id;
  end if;

  return new;
end;
$$;
create trigger coaching_sessions_auto_unassign
  after update on public.coaching_sessions
  for each row execute function public.auto_unassign_on_quota_completion();
