-- "Maarif TYT" Genel Deneme: the TYT-structured exam of an 11th grader gets its own title.
--
-- Until now an 11th grader's Genel Deneme was titled "11. SINIF Genel Deneme - <yayınevi>". It is scored exactly like TYT (four sections,
-- 4 yanlış 1 doğruyu götürür) and analysed against the merged 9th + 10th grade "Maarif TYT" courses. From now on the Genel Deneme of the
-- Maarif model comes in four kinds, chosen in "Yeni Görev Ekle":
--
--   "Maarif TYT Genel Deneme - ..."    the TYT-structured one (what "11. SINIF ..." has been so far)
--   "11. SINIF Genel Deneme - ..."     the 11th grade's OWN exam: four sections of 40 questions (160), analysed against the 11th-grade courses
--   "10. SINIF Genel Deneme - ..."     unchanged
--   "9. SINIF Genel Deneme - ..."      unchanged
--
-- So every EXISTING "11. SINIF Genel Deneme" row (they are all TYT-structured -- the 11th grade's own exam did not exist) must be renamed
-- to "Maarif TYT Genel Deneme", otherwise it would be read as the new 11th-grade exam. Only the title's prefix changes; the publisher after
-- the dash, the scores, the topic marks and everything else stay exactly as they are. 9. / 10. / 7. SINIF, TYT, AYT and LGS rows are not touched.
--
-- WHICH ROWS. task_type = 'general_exam', the title starts with "11. SINIF", and the row is TYT-shaped: its per-subject scores are empty/null
-- or carry the TYT keys (turkce / sosyal / matematik / fen) and none of the 11th grade's own keys (m11_*), and none of its topic marks was made
-- against an 11th-grade course ("maarif11-*"). Anything that does not fit is left alone and listed by the verification query at the end.
--
-- SAFETY. One DO block = one transaction: any failed check rolls everything back (the temporary trigger switch-off included). Every row it
-- changes is first copied to migration_backups.m0137_student_tasks (not exposed through the API). student_tasks has a guard trigger
-- (student_tasks_prevent_core_tampering) that is switched off for the single UPDATE and on again straight after, as in 0133. The checks verify
-- that the number of tasks and the question totals are unchanged and that no candidate is left. Idempotent: running it again finds nothing
-- to rename. The app reads both titles (a legacy "11. SINIF" title with TYT-shaped scores is read as Maarif TYT), so it makes no difference
-- whether you run this just before or just after deploying.

do $mig$
declare
  v_candidates bigint;
  v_renamed bigint := 0;
  v_tasks_before bigint;
  v_tasks_after bigint;
  v_sum_before numeric;
  v_sum_after numeric;
  v_left bigint;
begin
  create temporary table m0137_tasks on commit drop as
    select t.id
    from public.student_tasks t
    where t.task_type = 'general_exam'
      and t.title ~* '^\s*11\.\s*SINIF(\s|$)'
      and (
        t.subject_scores is null
        or t.subject_scores = '{}'::jsonb
        or (
          t.subject_scores ?| array['turkce', 'sosyal', 'matematik', 'fen']
          and not (t.subject_scores ?| array['m11_sosyal1', 'm11_matematik', 'm11_fen', 'm11_sosyal2'])
        )
      )
      and not exists (
        select 1 from public.student_task_topic_mistakes m where m.task_id = t.id and m.course_id like 'maarif11-%'
      );
  select count(*) into v_candidates from m0137_tasks;

  select count(*), coalesce(sum(coalesce(total_count, 0) + coalesce(correct_count, 0) + coalesce(wrong_count, 0) + coalesce(empty_count, 0)), 0)
    into v_tasks_before, v_sum_before
  from public.student_tasks;

  create schema if not exists migration_backups;
  create table if not exists migration_backups.m0137_student_tasks as
    select t.* from public.student_tasks t where false;
  insert into migration_backups.m0137_student_tasks
    select t.* from public.student_tasks t
    where t.id in (select id from m0137_tasks)
      and not exists (select 1 from migration_backups.m0137_student_tasks b where b.id = t.id);
  revoke all on all tables in schema migration_backups from anon, authenticated;

  alter table public.student_tasks disable trigger student_tasks_prevent_core_tampering;
  update public.student_tasks t
  set title = regexp_replace(t.title, '^\s*11\.\s*SINIF', 'Maarif TYT', 'i')
  where t.id in (select id from m0137_tasks);
  get diagnostics v_renamed = row_count;
  alter table public.student_tasks enable trigger student_tasks_prevent_core_tampering;

  -- Checks. Any failure raises -> the whole block rolls back.
  if v_renamed <> v_candidates then
    raise exception 'renamed % rows but found % candidates -- rolled back', v_renamed, v_candidates;
  end if;

  select count(*), coalesce(sum(coalesce(total_count, 0) + coalesce(correct_count, 0) + coalesce(wrong_count, 0) + coalesce(empty_count, 0)), 0)
    into v_tasks_after, v_sum_after
  from public.student_tasks;
  if v_tasks_after <> v_tasks_before then
    raise exception 'student_tasks row count changed (% -> %) -- rolled back', v_tasks_before, v_tasks_after;
  end if;
  if v_sum_after <> v_sum_before then
    raise exception 'question totals changed (% -> %) -- rolled back', v_sum_before, v_sum_after;
  end if;

  select count(*) into v_left from public.student_tasks t where t.id in (select id from m0137_tasks) and t.title ~* '^\s*11\.\s*SINIF';
  if v_left <> 0 then
    raise exception '% renamed rows still start with "11. SINIF" -- rolled back', v_left;
  end if;

  raise notice 'm0137 done. general exams renamed to "Maarif TYT": %', v_renamed;
end
$mig$;

notify pgrst, 'reload schema';

-- Verification (read-only): the Genel Deneme titles of the Maarif model, by kind.
--   "Maarif TYT"         the renamed (and any new) TYT-structured exams
--   "11. SINIF (kalan)"  rows that were NOT renamed because they did not look TYT-shaped -- expect 0 right after the migration
--                        (new 11th-grade own exams will show up here from now on, which is correct)
select
  case
    when title ~* '^\s*Maarif\s+TYT(\s|$)' then 'Maarif TYT'
    when title ~* '^\s*11\.\s*SINIF(\s|$)' then '11. SINIF (kalan)'
    when title ~* '^\s*10\.\s*SINIF(\s|$)' then '10. SINIF'
    when title ~* '^\s*9\.\s*SINIF(\s|$)' then '9. SINIF'
    else 'diğer'
  end as tur,
  count(*) as adet
from public.student_tasks
where task_type = 'general_exam' and (title ~* 'SINIF' or title ~* 'Maarif')
group by 1
order by 1;

-- ROLLBACK (only if ever needed; the backup holds the rows exactly as they were):
--   alter table public.student_tasks disable trigger student_tasks_prevent_core_tampering;
--   update public.student_tasks t set title = b.title from migration_backups.m0137_student_tasks b where t.id = b.id;
--   alter table public.student_tasks enable trigger student_tasks_prevent_core_tampering;
--   When you are happy: drop table migration_backups.m0137_student_tasks;
