-- password_reset_requests (0035) only granted INSERT to anon, mirroring
-- signup_requests exactly. But unlike a signup request (only ever
-- submitted by a logged-out visitor, by definition -- they have no
-- account yet), a locked-out user hitting "Şifremi Unuttum" can still be
-- carrying a valid session cookie (e.g. they're testing the flow while
-- still logged in, or a stale session from another tab) -- caught live
-- while testing: the insert failed with "permission denied for table
-- password_reset_requests" because the caller's role was `authenticated`,
-- which had no INSERT grant at all. Widening to both roles, same
-- with_check as before.
grant insert on public.password_reset_requests to authenticated;

drop policy "password_reset_requests_anon_insert" on public.password_reset_requests;

create policy "password_reset_requests_self_insert"
  on public.password_reset_requests for insert
  to anon, authenticated
  with check (status = 'pending' and resolved_by is null and resolved_at is null);
