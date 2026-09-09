-- Production-hardening audit (2026-09-09), pillar 1: cross-referenced
-- every foreign key in the schema against existing indexes. Postgres
-- never auto-indexes FK columns the way some other databases do, and an
-- unindexed FK means a full table scan every time the referenced row is
-- deleted/updated (to find and null-out/cascade the dependent rows) --
-- three were found genuinely missing. None of the three sit on a hot
-- application read path today (grep confirmed coach_tasks and
-- notifications are only ever filtered by coach_id, never student_id;
-- password_reset_requests.resolved_by is admin-audit-only), so this is a
-- correctness/future-proofing fix for ON DELETE behavior and any future
-- query that filters by these columns, not an urgent hot-path fix.
create index coach_tasks_student_idx on public.coach_tasks (student_id);
create index notifications_student_idx on public.notifications (student_id);
create index password_reset_requests_resolved_by_idx on public.password_reset_requests (resolved_by);
