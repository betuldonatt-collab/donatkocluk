-- Distinguishes wrong-answer from left-blank per missed topic. Default
-- 'wrong' for pre-existing rows -- they predate this distinction and
-- "wrong" is the closer approximation of the old undifferentiated
-- semantics (a student explicitly tagged it as a mistake).
create type public.topic_mistake_status as enum ('wrong', 'blank');
alter table public.student_task_topic_mistakes
  add column status public.topic_mistake_status not null default 'wrong';

notify pgrst, 'reload schema';
