-- =============================================================================
-- Sabit Görevler get a description (açıklama): free text the coach writes under
-- the task's title, shown on the coach's schedule board and Program tab and on the
-- student's board with the coach's line breaks kept. Nullable -- a fixed task
-- without one looks exactly as before.
-- (Regular tasks already have student_tasks.description; nothing to change there.)
-- Idempotent: safe to run more than once.
-- =============================================================================

alter table public.student_fixed_tasks
  add column if not exists description text;

alter table public.student_fixed_tasks
  drop constraint if exists student_fixed_tasks_description_length;
alter table public.student_fixed_tasks
  add constraint student_fixed_tasks_description_length
  check (description is null or char_length(description) <= 2000);

notify pgrst, 'reload schema';

-- Verification: expect 1 row.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'student_fixed_tasks' and column_name = 'description';
