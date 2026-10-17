-- Konu Çalışması / Video tasks are two tasks in one: a study / video part (a time target) and a question part (a question target).
--
-- The student declares the study / video part ("Konu Çalışması Durumu": Yapılmadı / Yarım / Yapıldı) and types the question counts; the
-- task's overall `status` is the merge of the two (weaker wins), so the student's own pick for the study part was not kept anywhere. The
-- completion percentages now credit each part on its own (lib/effort-weight.ts), which needs that pick: this adds it.
--
--   student_tasks.study_status  text, null | 'done' | 'half_done' | 'not_done'
--
-- Written by the student's save of a Konu Çalışması / Video task that has a question target (app/student/actions.ts). Null on every
-- other row -- including every row that exists today: those read their overall status as the pick (a row whose status was later set by hand
-- is read the same way), so nothing has to be backfilled and no percentage changes for them beyond the new two-part math.
--
-- Safe before or after the app deploy: until this column exists the app leaves it out of its queries and of its save, and reads the overall
-- status as the pick. Idempotent. Rollback: alter table public.student_tasks drop column study_status;

alter table public.student_tasks
  add column if not exists study_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_tasks'::regclass and conname = 'student_tasks_study_status_check'
  ) then
    alter table public.student_tasks
      add constraint student_tasks_study_status_check check (study_status is null or study_status in ('done', 'half_done', 'not_done'));
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Verification: expect column_exists = true and 0 for the rest right after running it.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'student_tasks' and column_name = 'study_status') as column_exists,
  (select count(*) from public.student_tasks where study_status is not null) as rows_with_a_pick;
