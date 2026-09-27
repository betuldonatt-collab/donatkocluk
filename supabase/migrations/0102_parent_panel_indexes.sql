-- OPTIONAL, low-risk indexes for the parent panel's hottest lookups.
--
-- An audit of the existing indexes found the parent panel's main queries already
-- covered: student_tasks (student_id, task_date), parent_students (parent_id,
-- student_id) unique, student_fixed_tasks (student_id, day_of_week), week_locks
-- (student_id), student_daily_stats (student_id, entry_date), task_resources
-- (task_id, order_index). So a missing index is NOT the likely cause of a slow
-- student switch (the tables are small); these three only tighten lookups that
-- currently rely on a wider index or a filter:
--
--   * student_tasks (student_id, task_type, task_date desc): the parent home's
--     "all general exams, newest first" query (LGS Genel Deneme chart);
--   * week_locks (student_id, week_start_date): exact-week lock lookups;
--   * parent_students (student_id): the RLS policies on student data check
--     "is this parent linked to that student" starting from the student side.
--
-- `if not exists` makes it safe to run twice; nothing else changes.
-- Rollback: drop the three indexes by name.

create index if not exists student_tasks_student_type_date_idx
  on public.student_tasks (student_id, task_type, task_date desc);

create index if not exists week_locks_student_week_idx
  on public.week_locks (student_id, week_start_date);

create index if not exists parent_students_student_idx
  on public.parent_students (student_id);
