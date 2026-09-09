-- 0041 created login_failed_attempts with RLS enabled but no GRANTs at
-- all. RLS and table-level GRANTs are separate gates: service_role
-- bypasses RLS policies, but still needs an explicit GRANT to touch the
-- table -- without one, every read/write from the admin client failed
-- with "permission denied for table login_failed_attempts" (42501),
-- silently swallowed by the console.error-only error handling in
-- app/login/actions.ts, so the brute-force lockout never actually
-- recorded anything. Deliberately NOT granted to anon/authenticated --
-- this table is reachable only via the service-role client, by design.
grant select, insert, update, delete on public.login_failed_attempts to service_role;

-- Same gap on password_reset_requests: the lockout guard's admin-queue
-- insert (recordFailedAttempt in app/login/actions.ts) and the
-- lockout-clearing deletes (manualResetPassword/resolvePasswordResetRequest
-- in app/admin/actions.ts) all run through the service-role client, which
-- had no grant on this table either -- anon/authenticated already had
-- exactly what the self-service request flow needs, service_role had
-- nothing.
grant select, insert, update, delete on public.password_reset_requests to service_role;

notify pgrst, 'reload schema';
