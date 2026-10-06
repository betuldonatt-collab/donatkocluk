-- Performance: three indexes on public.student_tasks for queries that had no usable index and therefore walked every
-- task of every student involved. Nothing about the data or the app's behaviour changes; only how fast these reads are.
--
-- Already well covered, so NOT touched: (student_id, task_date) for the weekly board / week windows (0005),
-- (coach_id, task_date), (student_id, task_type, task_date) for the parent and exam queries (0102), the pending-approval
-- (0059) and pending-evidence (0088) partial indexes, task_resources (task_id, order_index), the (student_id, ...) unique
-- keys of every progress / stats table. "postponed_to" (0127) and "status" are only ever filtered together with
-- student_id and a date window, which (student_id, task_date) already serves -- an index of their own would only slow writes.
--
-- 1. (student_id, updated_at desc) -- the coach dashboard's "recent activity" panel asks, for the whole roster, which
--    students touched a task in the last 3 days (updated_at >= now() - 3 days). With only (student_id, task_date) the
--    planner had to read every task of every student and test updated_at row by row.
-- 2. (student_id, task_date) WHERE analysis_pending -- "Eksik Deneme Sonucu" on the coach dashboard and "Analiz
--    Bekliyor" on the student's home filter on analysis_pending = true with no date window; only a handful of rows per
--    student qualify at any time, so a partial index keeps this to a few pages instead of the whole history.
-- 3. (student_id, course_id) WHERE status in ('done', 'half_done') -- recompute_student_topic_stats() (0072) runs after
--    every status / result change and re-sums one (course, topic) bucket from student_tasks; without this it scanned the
--    student's entire task history each time.
--
-- Plain CREATE INDEX (not CONCURRENTLY, which the SQL editor's transaction cannot run): the table is small enough that
-- each build takes a moment, during which writes to student_tasks wait. Run it at a quiet moment.
--
-- Idempotent: safe to run more than once.
-- Rollback: drop index if exists public.student_tasks_student_updated_idx, public.student_tasks_analysis_pending_idx,
--           public.student_tasks_student_course_done_idx;

create index if not exists student_tasks_student_updated_idx
  on public.student_tasks (student_id, updated_at desc);

create index if not exists student_tasks_analysis_pending_idx
  on public.student_tasks (student_id, task_date)
  where analysis_pending;

create index if not exists student_tasks_student_course_done_idx
  on public.student_tasks (student_id, course_id)
  where status in ('done', 'half_done');

analyze public.student_tasks;
