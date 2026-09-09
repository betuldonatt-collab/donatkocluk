-- Unified drag-and-drop ordering: a time block can now be interleaved
-- directly between tasks in the schedule board's single combined list
-- (Task 1 -> School -> Task 2), so student_events needs its own
-- order_index column, same shape as student_tasks.order_index. The
-- application computes one shared 0..N-1 sequence across both tables per
-- day and splits the resulting updates by row type -- see
-- app/coach/students/[id]/schedule/schedule-board.tsx.
alter table public.student_events add column order_index integer not null default 0;

notify pgrst, 'reload schema';
