-- Production-hardening audit (2026-09-09), rate-limiting review: the login
-- flow already has a robust per-phone lockout + per-IP throttle (0041/0048,
-- lib/login-lockout.ts) -- signup_requests and password_reset_requests are
-- the other two anonymous-insert public endpoints (submitSignupRequest /
-- submitPasswordResetRequest, app/login/actions.ts) and had zero abuse
-- protection: anyone could flood the admin's request queue with arbitrary
-- phone numbers. This is a generic version of login_ip_attempts (0048),
-- keyed by (ip, bucket) instead of being login-specific, so both forms
-- share one small primitive instead of two more copy-pasted tables.
create table public.public_form_ip_attempts (
  ip text not null,
  bucket text not null,
  fail_count int not null default 0,
  window_started_at timestamptz not null default now(),
  primary key (ip, bucket)
);
alter table public.public_form_ip_attempts enable row level security;
-- Same zero-RLS-grant-to-anon/authenticated pattern as login_ip_attempts --
-- reachable only via the service-role client.
grant select, insert, update, delete on public.public_form_ip_attempts to service_role;

-- Same atomic upsert-with-rolling-window shape as record_login_failure_ip
-- (0048): a fixed window per (ip, bucket) that resets itself once expired,
-- rather than an admin-clearable lock.
create or replace function public.record_public_form_attempt(p_ip text, p_bucket text, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.public_form_ip_attempts as pfa (ip, bucket, fail_count, window_started_at)
  values (p_ip, p_bucket, 1, now())
  on conflict (ip, bucket) do update
    set fail_count = case
          when pfa.window_started_at < now() - make_interval(secs => p_window_seconds) then 1
          else pfa.fail_count + 1
        end,
        window_started_at = case
          when pfa.window_started_at < now() - make_interval(secs => p_window_seconds) then now()
          else pfa.window_started_at
        end
  returning fail_count into v_count;

  return v_count;
end;
$$;

grant execute on function public.record_public_form_attempt(text, text, int) to service_role;

notify pgrst, 'reload schema';
