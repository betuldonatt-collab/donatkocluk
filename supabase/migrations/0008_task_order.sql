-- Drag-and-drop ordering for "Bugün" tasks. A personal view preference,
-- not a task definition -- deliberately left OUT of
-- prevent_student_task_core_tampering so a student can reorder even a
-- coach-assigned task; the existing student_tasks_student_update RLS
-- policy already covers writes to their own rows.
alter table public.student_tasks
  add column order_index int not null default 0;
