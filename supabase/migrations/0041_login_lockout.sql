-- Security Hardening Group 1 (Brute-Force Guard): tracks consecutive
-- failed login attempts PER PHONE NUMBER, not per profile id. Deliberate:
-- Supabase Auth's signInWithPassword already returns the identical
-- generic error for "wrong password" and "no such account", so keying
-- this off the phone string (rather than first resolving it to a
-- profiles.id, which would need the service-role client and a reliable
-- profiles.phone column -- it isn't one, see feedback_profiles_rls_admin_gap)
-- never leaks anything the client couldn't already infer, and needs no
-- extra lookup on the failure path.
--
-- No RLS policies at all, deliberately -- this table is written and read
-- exclusively through the service-role client (app/login/actions.ts), so
-- leaving it with zero grants to anon/authenticated means no client can
-- ever read or reset their own lockout state directly via PostgREST.
create table public.login_failed_attempts (
  phone text primary key,
  fail_count int not null default 0,
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.login_failed_attempts enable row level security;

-- Surfaces a security lockout inside the existing "Şifremi Unuttum" admin
-- queue (0035) rather than building a second queue -- reason is null for
-- an ordinary self-service request and set to a flagged message for an
-- auto-generated lockout entry, so the admin UI can tell the two apart
-- and word the row differently.
alter table public.password_reset_requests add column reason text;
