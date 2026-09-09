-- UX audit finding: rejectStudentTask used to hard-DELETE a student's
-- self-logged task with no reason and no notification -- the student just
-- found their own logged work silently gone one day, with zero
-- explanation. Two new nullable columns let the row survive rejection as
-- a transparent, visible record instead: the student's own task board can
-- show WHY it's not counted, rather than making it vanish.
alter table public.student_tasks add column rejected_at timestamptz;
alter table public.student_tasks add column rejection_reason text;

notify pgrst, 'reload schema';
