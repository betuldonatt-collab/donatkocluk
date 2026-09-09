-- Platform Hardening Audit, P1: two admin-dashboard numbers (Yenileme
-- Radarı's completed-session count per student, and each coach's average
-- rating) were fetched as every matching row platform-wide, forever, then
-- reduced to a Map in JS on every dashboard load. Views push the
-- aggregation into Postgres instead.
--
-- security_invoker = true is not optional here: a plain view (the
-- Postgres default) checks the underlying table's permissions as the
-- VIEW OWNER, not the querying role -- since this migration runs as the
-- postgres superuser (which bypasses RLS entirely), an invoker-less view
-- would silently leak every row in coaching_sessions to any authenticated
-- caller regardless of RLS. Confirmed by testing: without this option, a
-- role-simulated non-admin query returned rows it has no RLS policy
-- granting it access to. With it, the view enforces coaching_sessions'
-- existing RLS per-row based on whoever is actually querying -- the same
-- boundary the raw queries these views replace already relied on.
create view public.student_completed_session_counts
with (security_invoker = true) as
select student_id, count(*) as completed_count
from public.coaching_sessions
where outcome = 'completed'
group by student_id;

grant select on public.student_completed_session_counts to authenticated;

create view public.coach_average_ratings
with (security_invoker = true) as
select coach_id, avg(student_rating) as avg_rating, count(*) as rating_count
from public.coaching_sessions
where student_rating is not null
group by coach_id;

grant select on public.coach_average_ratings to authenticated;

notify pgrst, 'reload schema';
