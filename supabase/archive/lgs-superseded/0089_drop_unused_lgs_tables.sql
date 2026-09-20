-- LGS cleanup: drop the tables that became redundant once LGS was moved onto
-- the shared YKS infrastructure (student_tasks + student_task_topic_mistakes).
--
-- DROPPED (nothing in the app reads or writes any of them):
--   lgs_tasks                        (0088) -- abandoned task board
--   lgs_general_exam_topic_mistakes  (0086)
--   lgs_branch_exam_topic_mistakes   (0086)
--   lgs_general_exams                (0085)
--   lgs_branch_exams                 (0085)
--   lgs_topic_pipeline_status        (0087) -- never wired to a page
--   type public.lgs_subject                 -- only these tables used it
--
-- KEPT (in use):
--   lgs_daily_routines (0087)   -- Paragraf / Kitap Okuma page + coach charts
--   profiles.exam_type, target_high_school, target_percentile,
--   report_card_average, ... (0085/0086) -- LGS profile + cohort switch
--
-- Idempotent: safe to run more than once (IF EXISTS everywhere).
-- Data guard: refuses to run if any of the tables still holds rows, so it
-- can never silently delete data. Review the counts it reports; to drop
-- anyway, delete the guard block below and re-run.

do $$
declare
  t text;
  n bigint;
  offenders text := '';
begin
  foreach t in array array[
    'lgs_tasks',
    'lgs_general_exam_topic_mistakes',
    'lgs_branch_exam_topic_mistakes',
    'lgs_general_exams',
    'lgs_branch_exams',
    'lgs_topic_pipeline_status'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        offenders := offenders || format('%s (%s rows) ', t, n);
      end if;
    end if;
  end loop;

  if offenders <> '' then
    raise exception 'Refusing to drop: these tables still contain data -> %', offenders;
  end if;
end $$;

-- Children first (they reference the exam tables), then parents.
drop table if exists public.lgs_tasks;
drop table if exists public.lgs_general_exam_topic_mistakes;
drop table if exists public.lgs_branch_exam_topic_mistakes;
drop table if exists public.lgs_general_exams;
drop table if exists public.lgs_branch_exams;
drop table if exists public.lgs_topic_pipeline_status;

-- The enum was only used by the tables above. Left in place (no error) if
-- something else turns out to depend on it.
do $$
begin
  drop type if exists public.lgs_subject;
exception
  when dependent_objects_still_exist then
    raise notice 'public.lgs_subject is still used by another object; leaving it in place.';
end $$;

notify pgrst, 'reload schema';

-- Verification: expect exactly one row (lgs_daily_routines).
select tablename from pg_tables
where schemaname = 'public' and tablename like 'lgs\_%' escape '\'
order by tablename;
