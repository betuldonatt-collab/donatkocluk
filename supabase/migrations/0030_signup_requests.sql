-- "Pending Approval" signup architecture. This exists specifically to
-- close a vulnerability: the previous public signup flow called
-- auth.signUp() directly with a client-chosen role in raw_user_meta_data,
-- which handle_new_user() (0001) trusted uncritically -- including
-- 'admin', since nothing validated the role was one a stranger should
-- ever be allowed to grant themselves.
--
-- The fix is architectural, not just a validation patch: public signup no
-- longer touches auth.users/profiles AT ALL. It only inserts a row here.
-- No account exists until an admin approves it, and 'admin' is not a
-- legal value of signup_request_role -- it is structurally impossible for
-- this table to produce an admin account, regardless of what an attacker
-- submits. The one place a real account gets created (approveSignupRequest,
-- app/admin/actions.ts) uses the service-role client from an
-- admin-authenticated action, with the role sourced from this
-- already-constrained column -- never from arbitrary client input at
-- account-creation time.
create type public.signup_request_role as enum ('student', 'parent', 'coach');
create type public.signup_request_status as enum ('pending', 'approved', 'rejected');

create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  requested_role public.signup_request_role not null,
  status public.signup_request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_note text,
  created_at timestamptz not null default now()
);

create index signup_requests_status_idx on public.signup_requests (status, created_at);

alter table public.signup_requests enable row level security;

-- Submitted by someone who, by definition, has no account yet -- this is
-- the one table in the whole schema granted to anon, not authenticated.
-- Deliberately insert-only for anon: no select/update/delete, so a
-- submitter can't read back other people's requests or self-approve.
grant insert on public.signup_requests to anon;
grant select, update, delete on public.signup_requests to authenticated;

create policy "signup_requests_anon_insert"
  on public.signup_requests for insert
  to anon
  with check (status = 'pending' and reviewed_by is null and reviewed_at is null);

create policy "signup_requests_admin_all"
  on public.signup_requests for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
