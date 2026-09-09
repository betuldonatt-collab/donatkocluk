-- week_locks (0037) granted authenticated only select/insert/delete, but
-- lockWeek() (app/coach/actions.ts) upserts on the (student_id,
-- week_start_date) unique constraint -- PostgREST compiles that to a
-- single INSERT ... ON CONFLICT DO UPDATE statement, which needs UPDATE
-- privilege on the table even when no conflict actually occurs. Caught
-- live: locking a week failed with "permission denied for table
-- week_locks". Same class of bug as 0036 (grant didn't match how the
-- table is actually written to).
grant update on public.week_locks to authenticated;
