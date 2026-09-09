-- Fixes from the security/architecture audit. Three independent changes:
--
-- 1) Cascade-delete hardening (Group 1): coach_notes.coach_id and
--    coaching_sessions.coach_id were ON DELETE CASCADE -- deactivating
--    (or ever deleting) a coach would have hard-deleted every note and
--    session record they ever touched, including ones for students long
--    since reassigned to someone else. student_tasks.coach_id already
--    used SET NULL correctly; this brings the other two in line with
--    that same, already-established pattern. Requires dropping NOT NULL
--    first since a SET NULL action needs the column to actually accept
--    null.
alter table public.coach_notes alter column coach_id drop not null;
alter table public.coach_notes drop constraint coach_notes_coach_id_fkey;
alter table public.coach_notes
  add constraint coach_notes_coach_id_fkey
  foreign key (coach_id) references public.profiles(id) on delete set null;

alter table public.coaching_sessions alter column coach_id drop not null;
alter table public.coaching_sessions drop constraint coaching_sessions_coach_id_fkey;
alter table public.coaching_sessions
  add constraint coaching_sessions_coach_id_fkey
  foreign key (coach_id) references public.profiles(id) on delete set null;

-- 2) Quota renewal cycle (Group 2): auto_unassign_on_quota_completion
-- (0027) counted a student's COMPLETED sessions over their entire
-- lifetime with no reset point, so a renewed student re-triggered the
-- same auto-unassign on literally their first post-renewal session,
-- since their old completed count already exceeded the (new) quota.
-- quota_cycle_start_at is the reset point -- every renewal/reassignment
-- bumps it to "now", so the trigger only counts sessions completed
-- since then. Past sessions are never touched or hidden, just excluded
-- from THIS cycle's quota math.
alter table public.profiles add column quota_cycle_start_at timestamptz not null default now();

create or replace function public.auto_unassign_on_quota_completion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_quota int;
  v_cycle_start timestamptz;
  v_completed int;
begin
  if new.outcome <> 'completed' or (old.outcome is not null and old.outcome = 'completed') then
    return new;
  end if;

  select total_session_quota, quota_cycle_start_at into v_quota, v_cycle_start
    from public.profiles where id = new.student_id;
  if v_quota is null or v_quota <= 0 then
    return new;
  end if;

  select count(*) into v_completed from public.coaching_sessions
    where student_id = new.student_id and outcome = 'completed' and scheduled_at >= v_cycle_start;

  if v_completed >= v_quota then
    delete from public.coach_students where student_id = new.student_id;
    update public.profiles set pool_status = 'quota_completed' where id = new.student_id;
  end if;

  return new;
end;
$$;

-- 3) Parent read access to daily stats (Group 4) -- mirrors the existing
-- student_tasks_parent_read / coach_notes_parent_read pattern exactly.
create policy "student_daily_stats_parent_read"
  on public.student_daily_stats for select
  to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = student_daily_stats.student_id
  ));

-- 4) Password reset requests (Group 3) -- an unauthenticated visitor on
-- the login page has no session, so this can't be gated by auth.uid()
-- at all; mirrors signup_requests' anon-insert-only pattern (0030)
-- exactly, for the same reason.
create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (length(trim(phone)) > 0),
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index password_reset_requests_status_idx on public.password_reset_requests (status, created_at);

alter table public.password_reset_requests enable row level security;

grant insert on public.password_reset_requests to anon;
grant select, update on public.password_reset_requests to authenticated;

create policy "password_reset_requests_anon_insert"
  on public.password_reset_requests for insert
  to anon
  with check (status = 'pending' and resolved_by is null and resolved_at is null);

create policy "password_reset_requests_admin_all"
  on public.password_reset_requests for all
  to authenticated
  using (is_admin())
  with check (is_admin());
