-- Manual catch-up for the production Supabase project: paste this whole
-- file into the Supabase Dashboard's SQL Editor and run it once. This is
-- the exact content of migrations 0041, 0042, and 0048, made idempotent
-- with `if not exists` since it's being applied out-of-band (not through
-- `supabase db push`) to unblock login immediately. This does NOT replace
-- properly catching production up on the full migration history -- see
-- the CLI-based plan for that.

create table if not exists public.login_failed_attempts (
  phone text primary key,
  fail_count int not null default 0,
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.login_failed_attempts enable row level security;

create table if not exists public.login_ip_attempts (
  ip text primary key,
  fail_count int not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.login_ip_attempts enable row level security;

grant select, insert, update, delete on public.login_failed_attempts to service_role;
grant select, insert, update, delete on public.password_reset_requests to service_role;
grant select, insert, update, delete on public.login_ip_attempts to service_role;

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
