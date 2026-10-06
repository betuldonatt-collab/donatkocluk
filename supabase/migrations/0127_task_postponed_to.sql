-- "Toplu İşlem" (bulk transfer) on the coach's weekly board: unfinished tasks are copied to a new date and the originals
-- are marked "Ertelendi" instead of being deleted.
--
-- "Ertelendi" is NOT a new value of the task_status enum. Every completion rate, topic stat, Karne figure and alert keys
-- off the four existing statuses (pending / done / half_done / not_done), and a postponed task is still a task that
-- was not done on its day. So it is a flag on top of the status instead:
--
--   student_tasks.postponed_to  date, null = not postponed. The date the copy was handed out for.
--
-- The coach's transfer sets it on each original (a task nobody had marked yet also becomes 'not_done'; a half-done one
-- keeps its status). The board shows an "Ertelendi -> 14 Eki" badge when it is set, and the "Tamamlanmayan Görevler"
-- lists skip a postponed task (it has been dealt with: its copy is waiting on the new date).
--
-- No policy or trigger changes: the coach's existing UPDATE policy on student_tasks covers the new column, and the
-- students' own update rules never touch it.
--
-- Idempotent: safe to run more than once.
-- Rollback: alter table public.student_tasks drop column postponed_to;

alter table public.student_tasks add column if not exists postponed_to date;

notify pgrst, 'reload schema';
