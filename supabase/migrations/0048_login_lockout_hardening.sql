-- Platform Hardening Audit, P0: the old brute-force counter was a
-- select-then-upsert in app/login/actions.ts -- concurrent wrong-password
-- requests could all read the same stale fail_count and each write back
-- stale+1, letting an attacker who parallelizes guesses defeat the
-- 5-attempt lock. A single INSERT ... ON CONFLICT DO UPDATE takes
-- Postgres's own row lock for the statement's duration (held through the
-- rest of this function call, since it all runs as one transaction), so
-- concurrent calls for the same phone now genuinely serialize instead of
-- racing on a JS-side read.
--
-- just_locked (via FOUND on the guarded UPDATE below) tells the caller
-- whether THIS call was the one that flipped locked_at from null -- only
-- ever true for exactly one of any concurrent callers -- so the queued
-- admin notification in app/login/actions.ts still fires exactly once
-- per lock event, not once per attempt after the lock.
create or replace function public.record_login_failure(p_phone text, p_max_attempts int)
returns table(fail_count int, locked_at timestamptz, just_locked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_just_locked boolean := false;
begin
  insert into public.login_failed_attempts as lfa (phone, fail_count, locked_at, updated_at)
  values (p_phone, 1, null, now())
  on conflict (phone) do update
    set fail_count = lfa.fail_count + 1,
        updated_at = now();

  -- Every column reference here is qualified with an alias -- the
  -- function's own OUT parameters (fail_count, locked_at) otherwise
  -- shadow the table's identically-named columns throughout the whole
  -- body, not just in RETURN QUERY, and an unqualified "locked_at is
  -- null" resolves to the (always-null-until-assigned) OUT parameter
  -- instead of the row, silently never matching.
  update public.login_failed_attempts as lfa2
    set locked_at = now()
    where lfa2.phone = p_phone and lfa2.fail_count >= p_max_attempts and lfa2.locked_at is null;
  v_just_locked := found;

  return query
    select lfa3.fail_count, lfa3.locked_at, v_just_locked
    from public.login_failed_attempts lfa3
    where lfa3.phone = p_phone;
end;
$$;

grant execute on function public.record_login_failure(text, int) to service_role;

-- Same audit, second P0 item: the phone-keyed lock alone let anyone who
-- knows a victim's phone number lock that account indefinitely (no
-- CAPTCHA, no IP throttle, no expiry -- required an admin to clear). The
-- lock now expires on its own (TTL read in app/login/actions.ts's
-- checkLockout, not stored here), and this table adds an independent,
-- IP-scoped throttle: a fixed-window fail counter across ALL phone
-- numbers from one IP, so a single attacker can't mass-target many
-- victims even while staying under any one phone's own threshold. Same
-- zero-RLS-grant-to-anon/authenticated pattern as login_failed_attempts
-- (0041) -- reachable only via the service-role client.
create table public.login_ip_attempts (
  ip text primary key,
  fail_count int not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.login_ip_attempts enable row level security;
grant select, insert, update, delete on public.login_ip_attempts to service_role;

-- Atomic for the same reason as record_login_failure above. Also resets
-- the window (rather than locking permanently) when the prior window has
-- expired -- this is a rolling throttle, not an admin-clearable lock.
create or replace function public.record_login_failure_ip(p_ip text, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.login_ip_attempts as lia (ip, fail_count, window_started_at)
  values (p_ip, 1, now())
  on conflict (ip) do update
    set fail_count = case
          when lia.window_started_at < now() - make_interval(secs => p_window_seconds) then 1
          else lia.fail_count + 1
        end,
        window_started_at = case
          when lia.window_started_at < now() - make_interval(secs => p_window_seconds) then now()
          else lia.window_started_at
        end
  returning fail_count into v_count;

  return v_count;
end;
$$;

grant execute on function public.record_login_failure_ip(text, int) to service_role;

notify pgrst, 'reload schema';
