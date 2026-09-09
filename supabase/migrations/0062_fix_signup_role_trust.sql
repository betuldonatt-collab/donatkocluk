-- Security audit finding (Critical): 0030_signup_requests.sql's own comment
-- claims "it is structurally impossible for [the app] to produce an admin
-- account, regardless of what an attacker submits" -- true only for the
-- app's own signup FORM. It never touched handle_new_user() (0001) itself,
-- which still reads role from raw_user_meta_data. That column is exactly
-- what Supabase's public, anon-key auth.signUp() REST endpoint lets ANY
-- caller set directly (`options.data` on the client SDK, or a raw POST to
-- /auth/v1/signup) -- completely independent of this app's UI/signup_requests
-- table. Anyone could call it with data: { role: "admin" } and get an
-- instant, fully-privileged profiles.role = 'admin' row, since is_admin()
-- (0001) trusts that column everywhere.
--
-- The fix: read role from raw_app_meta_data instead. Unlike user_meta_data,
-- app_metadata can ONLY be set via the Supabase Admin API (service-role
-- key, server-side) -- the public client-side signUp() call has no way to
-- write it at all, by Supabase's own design. This is the standard,
-- documented mechanism for exactly this problem, and requires no new
-- "trusted flag" of our own that a client could just as easily forge.
--
-- approveSignupRequest (app/admin/actions.ts) is updated in the same
-- change to pass role via app_metadata instead of user_metadata when it
-- calls adminClient.auth.admin.createUser() -- that's the one legitimate
-- account-creation path, already gated by requireAdmin() and already
-- sourcing the role from signup_requests.requested_role (which structurally
-- excludes 'admin' -- see 0030). supabase/seed.sql's local test-account
-- helper is updated the same way so `supabase db reset` still produces a
-- working local admin/coach/parent account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'student'),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;
