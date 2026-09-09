-- "Soft Coach Approval for Student Entries" -- a student's own
-- self-created task (question_bank/topic_study/branch_exam/etc, created
-- via the "Ek Çalışma Ekle" rich dialog or the old simple form) starts
-- unreviewed. It always shows up in the student's own daily log
-- immediately (recomputeDailyStats/the dashboard don't filter on this),
-- but is EXCLUDED from Kaynak Takibi, Gelişim Haritası, and Karne until
-- a coach explicitly approves it -- those three are meant to reflect
-- coach-reviewed, trustworthy history, not unverified self-reporting.
--
-- Coach-assigned tasks need no separate review (the coach originated
-- them), so they're backfilled/defaulted to already-approved below.
alter table public.student_tasks add column is_approved_by_coach boolean not null default false;

update public.student_tasks set is_approved_by_coach = true where is_coach_assigned = true;

-- Speeds up "pending review" listings (coach_id, is_coach_assigned = false,
-- is_approved_by_coach = false) without a full table scan.
create index student_tasks_pending_approval_idx on public.student_tasks (student_id, is_approved_by_coach)
  where is_coach_assigned = false;

notify pgrst, 'reload schema';
