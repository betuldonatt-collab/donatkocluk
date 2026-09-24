-- Carries the "9. Sınıf (Maarif)" choice from the public signup form to
-- account approval (approveSignupRequest copies it onto profiles.is_maarif9,
-- added in 0096).
--
--   - NOT NULL DEFAULT false: existing requests and every non-9th-grade
--     signup are unaffected.
--   - No policy/grant change needed: signup_requests_anon_insert only checks
--     status = 'pending' and anon's INSERT grant is table-level, so it
--     already covers the new column.
--
-- Rollback: alter table public.signup_requests drop column is_maarif9;

alter table public.signup_requests
  add column if not exists is_maarif9 boolean not null default false;

notify pgrst, 'reload schema';
