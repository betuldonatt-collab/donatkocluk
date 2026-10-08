-- AYT: ONE course per subject that belongs to more than one field.
--
-- Matematik and Geometri (Sayısal + Eşit Ağırlık) and Edebiyat, Tarih 1 and Coğrafya 1 (Eşit Ağırlık + Sözel) used to exist once per field --
-- "ayt-matematik-sayisal" / "ayt-matematik-ea", "ayt-edebiyat-ea" / "ayt-edebiyat-sozel", ... -- with identical topics. The curriculum is
-- application content (lib/curriculum/*.json), not a table, so the "duplicate courses and topics" are removed there (ayt-shared.json: one
-- course each, one set of topic ids); what lives in the DATABASE is everything that REFERENCES a course or topic id. This moves every such
-- record to the unified ids:
--
--   course ids:  ayt-matematik-sayisal, ayt-matematik-ea            -> ayt-matematik
--                ayt-geometri-sayisal, ayt-geometri-ea              -> ayt-geometri
--                ayt-edebiyat-ea,      ayt-edebiyat-sozel           -> ayt-edebiyat
--                ayt-tarih-1-ea,       ayt-tarih-1-sozel            -> ayt-tarih-1
--                ayt-cografya-1-ea,    ayt-cografya-1-sozel         -> ayt-cografya-1
--                ayt-matematik-sayisal-macro, ayt-matematik-ea-macro -> ayt-matematik-macro   (the combined branch exam "AYT Matematik")
--                ayt-sos1-ea-macro,    ayt-sos1-sozel-macro         -> ayt-sos1-macro         (the combined branch exam "AYT Sos 1")
--   topic ids:   only where the old id carried the course: every "(Genel)" master ("ayt-matematik-sayisal-genel-u1" -> "ayt-matematik-genel-u1")
--                and all of Geometri ("ayt-geometri-ea-u0-t0" -> "ayt-geometri-u0-t0"). The plain topics of the other subjects
--                ("ayt-matematik-u0-t0") already had one id in both fields and do not change.
--
-- WHERE (every table that stores a course id / topic id):
--   student_tasks, student_task_topic_mistakes, student_task_topic_breakdown, student_resources, student_resource_progress,
--   yks_topic_pipeline_status; student_topic_stats (the derived cache) is rebuilt from the tasks.
-- NOT REWRITTEN ON PURPOSE: archived Karne snapshots (student_report_cards.topic_mistakes) -- an archive keeps the ids it was saved with; the
-- app reads them through the unified ids (lib/curriculum/legacy-course-ids.ts, karneTopicRowsForCourse), so nothing is lost or hidden.
--
-- MERGING. A student who used BOTH fields' copy of a subject now has one course, so rows can land on the same key: exam mistakes and topic
-- breakdowns are de-duplicated (a breakdown's counts are added), pipeline ticks are OR-ed. Nothing is overwritten and no row is dropped
-- without its content being folded into the survivor. Resources (kaynaklar) keep their ids and simply follow their course -- a student who
-- added the same book under both copies now sees it twice in the subject's table (archive one if you like); no task link is touched.
--
-- SAFETY. One DO block = one transaction: any error or failed check rolls EVERYTHING back (including the temporary trigger switch-off).
-- Every row it changes is first copied to schema migration_backups (not exposed through the API), tables m0133_*. The final checks verify that
-- the number of tasks and every student's question totals are unchanged and that no old id is left anywhere. student_tasks has a guard
-- trigger (prevent_student_task_core_tampering) that forbids changing a coach-assigned task's course/topic from anything but a coach/admin
-- session; this script runs as the database owner, so that one trigger is switched off for the single UPDATE and on again straight after.
--
-- Run it right after the new version is deployed (until then the app looks for the unified ids and finds nothing recorded under them; no data
-- is lost -- it is just not shown). Run it ONCE, in the SQL editor, at a quiet moment (it briefly locks student_tasks). Idempotent: running it
-- again finds nothing left to move.

do $mig$
declare
  v_tasks int := 0;
  v_mistakes int := 0;
  v_mistakes_merged int := 0;
  v_breakdown int := 0;
  v_breakdown_merged int := 0;
  v_resources int := 0;
  v_progress int := 0;
  v_pipeline int := 0;
  v_pipeline_merged int := 0;
  v_stats_rebuilt int := 0;
  v_before record;
  v_after record;
  v_tasks_before bigint;
  v_tasks_after bigint;
  v_leftover bigint;
begin
  create temporary table m0133_courses (old_id text primary key, new_id text not null) on commit drop;
  insert into m0133_courses values
    ('ayt-matematik-sayisal', 'ayt-matematik'), ('ayt-matematik-ea', 'ayt-matematik'),
    ('ayt-geometri-sayisal', 'ayt-geometri'), ('ayt-geometri-ea', 'ayt-geometri'),
    ('ayt-edebiyat-ea', 'ayt-edebiyat'), ('ayt-edebiyat-sozel', 'ayt-edebiyat'),
    ('ayt-tarih-1-ea', 'ayt-tarih-1'), ('ayt-tarih-1-sozel', 'ayt-tarih-1'),
    ('ayt-cografya-1-ea', 'ayt-cografya-1'), ('ayt-cografya-1-sozel', 'ayt-cografya-1'),
    ('ayt-matematik-sayisal-macro', 'ayt-matematik-macro'), ('ayt-matematik-ea-macro', 'ayt-matematik-macro'),
    ('ayt-sos1-ea-macro', 'ayt-sos1-macro'), ('ayt-sos1-sozel-macro', 'ayt-sos1-macro');

  -- topic ids carrying an old REGULAR course id as their prefix (a macro course's topics are its sources' topics)
  create temporary table m0133_prefix (old_prefix text primary key, new_prefix text not null) on commit drop;
  insert into m0133_prefix
    select old_id || '-', new_id || '-' from m0133_courses where old_id not like '%-macro';

  create or replace function pg_temp.m0133_topic(t text) returns text language sql stable as $f$
    select coalesce(
      (select p.new_prefix || substr(t, length(p.old_prefix) + 1) from m0133_prefix p where t like p.old_prefix || '%' limit 1),
      t
    );
  $f$;
  create or replace function pg_temp.m0133_course(c text) returns text language sql stable as $f$
    select coalesce((select m.new_id from m0133_courses m where m.old_id = c), c);
  $f$;

  -- invariants checked at the end
  select count(*) into v_tasks_before from public.student_tasks;
  create temporary table m0133_before on commit drop as
    select student_id,
           coalesce(sum(total_count), 0) as total, coalesce(sum(correct_count), 0) as correct,
           coalesce(sum(wrong_count), 0) as wrong, coalesce(sum(empty_count), 0) as empty
    from public.student_tasks group by student_id;

  -- The rows that change (decided once, up front): their course or topic id is an old one.
  create temporary table m0133_tasks on commit drop as
    select t.id, pg_temp.m0133_course(t.course_id) as new_course, case when t.topic_id is null then null else pg_temp.m0133_topic(t.topic_id) end as new_topic
    from public.student_tasks t
    where t.course_id in (select old_id from m0133_courses) or (t.topic_id is not null and pg_temp.m0133_topic(t.topic_id) <> t.topic_id);

  create temporary table m0133_mistakes on commit drop as
    select k.id, k.task_id, k.status, pg_temp.m0133_course(k.course_id) as new_course, pg_temp.m0133_topic(k.topic_id) as new_topic
    from public.student_task_topic_mistakes k
    where k.course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(k.topic_id) <> k.topic_id;

  create temporary table m0133_breakdown on commit drop as
    select b.id, b.task_id, pg_temp.m0133_course(b.course_id) as new_course, pg_temp.m0133_topic(b.topic_id) as new_topic
    from public.student_task_topic_breakdown b
    where b.course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(b.topic_id) <> b.topic_id;

  create temporary table m0133_resources on commit drop as
    select r.id, pg_temp.m0133_course(r.course_id) as new_course
    from public.student_resources r where r.course_id in (select old_id from m0133_courses);

  create temporary table m0133_progress on commit drop as
    select p.id, pg_temp.m0133_course(p.course_id) as new_course, pg_temp.m0133_topic(p.topic_id) as new_topic
    from public.student_resource_progress p
    where p.course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(p.topic_id) <> p.topic_id;

  create temporary table m0133_pipeline on commit drop as
    select p.id, p.student_id, pg_temp.m0133_course(p.course_id) as new_course, pg_temp.m0133_topic(p.topic_id) as new_topic
    from public.yks_topic_pipeline_status p
    where p.course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(p.topic_id) <> p.topic_id;

  -- Survivors of the unique keys: for every moved row, the row that carries its target key afterwards -- an existing row already on
  -- that key, otherwise the smallest id among the moved rows sharing it.
  create temporary table m0133_mistakes_sv on commit drop as
    select x.id as moved_id,
      coalesce(
        (select e.id from public.student_task_topic_mistakes e
          where e.task_id = x.task_id and e.course_id = x.new_course and e.topic_id = x.new_topic and e.status = x.status
            and e.id not in (select id from m0133_mistakes) limit 1),
        (select (array_agg(y.id order by y.id::text))[1] from m0133_mistakes y
          where y.task_id = x.task_id and y.new_course = x.new_course and y.new_topic = x.new_topic and y.status = x.status)
      ) as survivor_id
    from m0133_mistakes x;

  create temporary table m0133_breakdown_sv on commit drop as
    select x.id as moved_id,
      coalesce(
        (select e.id from public.student_task_topic_breakdown e
          where e.task_id = x.task_id and e.topic_id = x.new_topic and e.id not in (select id from m0133_breakdown) limit 1),
        (select (array_agg(y.id order by y.id::text))[1] from m0133_breakdown y where y.task_id = x.task_id and y.new_topic = x.new_topic)
      ) as survivor_id
    from m0133_breakdown x;

  create temporary table m0133_pipeline_sv on commit drop as
    select x.id as moved_id,
      coalesce(
        (select e.id from public.yks_topic_pipeline_status e
          where e.student_id = x.student_id and e.course_id = x.new_course and e.topic_id = x.new_topic
            and e.id not in (select id from m0133_pipeline) limit 1),
        (select (array_agg(y.id order by y.id::text))[1] from m0133_pipeline y
          where y.student_id = x.student_id and y.new_course = x.new_course and y.new_topic = x.new_topic)
      ) as survivor_id
    from m0133_pipeline x;

  -- Backups of exactly the rows about to change (the moved ones, and the survivors that absorb a merge).
  create schema if not exists migration_backups;
  create table if not exists migration_backups.m0133_student_tasks as
    select t.* from public.student_tasks t where t.id in (select id from m0133_tasks);
  create table if not exists migration_backups.m0133_mistakes as
    select k.* from public.student_task_topic_mistakes k
    where k.id in (select id from m0133_mistakes) or k.id in (select survivor_id from m0133_mistakes_sv);
  create table if not exists migration_backups.m0133_breakdown as
    select b.* from public.student_task_topic_breakdown b
    where b.id in (select id from m0133_breakdown) or b.id in (select survivor_id from m0133_breakdown_sv);
  create table if not exists migration_backups.m0133_resources as
    select r.* from public.student_resources r where r.id in (select id from m0133_resources);
  create table if not exists migration_backups.m0133_resource_progress as
    select p.* from public.student_resource_progress p where p.id in (select id from m0133_progress);
  create table if not exists migration_backups.m0133_pipeline as
    select p.* from public.yks_topic_pipeline_status p
    where p.id in (select id from m0133_pipeline) or p.id in (select survivor_id from m0133_pipeline_sv);
  create table if not exists migration_backups.m0133_topic_stats as
    select s.* from public.student_topic_stats s
    where s.course_id in (select old_id from m0133_courses union select new_id from m0133_courses);
  revoke all on all tables in schema migration_backups from anon, authenticated;

  -- 1. Tasks. The guard trigger is off for this one statement only.
  alter table public.student_tasks disable trigger student_tasks_prevent_core_tampering;
  update public.student_tasks t set course_id = x.new_course, topic_id = x.new_topic from m0133_tasks x where t.id = x.id;
  get diagnostics v_tasks = row_count;
  alter table public.student_tasks enable trigger student_tasks_prevent_core_tampering;

  -- 2. Exam mistakes: unique (task, course, topic, status). Rows landing on an occupied key are dropped (the survivor already says the same).
  delete from public.student_task_topic_mistakes k using m0133_mistakes_sv sv
    where k.id = sv.moved_id and sv.moved_id <> sv.survivor_id;
  get diagnostics v_mistakes_merged = row_count;
  update public.student_task_topic_mistakes k set course_id = x.new_course, topic_id = x.new_topic
    from m0133_mistakes x join m0133_mistakes_sv sv on sv.moved_id = x.id
    where k.id = x.id and sv.moved_id = sv.survivor_id;
  get diagnostics v_mistakes = row_count;

  -- 3. Per-task topic breakdown: unique (task, topic). Counts are added into the survivor, then the extra rows go.
  update public.student_task_topic_breakdown s
  set total_questions = s.total_questions + agg.total_questions,
      correct_answers = s.correct_answers + agg.correct_answers,
      incorrect_answers = s.incorrect_answers + agg.incorrect_answers
  from (
    select sv.survivor_id, sum(b.total_questions)::int as total_questions, sum(b.correct_answers)::int as correct_answers,
           sum(b.incorrect_answers)::int as incorrect_answers
    from m0133_breakdown_sv sv join public.student_task_topic_breakdown b on b.id = sv.moved_id
    where sv.moved_id <> sv.survivor_id
    group by sv.survivor_id
  ) agg
  where s.id = agg.survivor_id;
  delete from public.student_task_topic_breakdown b using m0133_breakdown_sv sv
    where b.id = sv.moved_id and sv.moved_id <> sv.survivor_id;
  get diagnostics v_breakdown_merged = row_count;
  update public.student_task_topic_breakdown b set course_id = x.new_course, topic_id = x.new_topic
    from m0133_breakdown x join m0133_breakdown_sv sv on sv.moved_id = x.id
    where b.id = x.id and sv.moved_id = sv.survivor_id;
  get diagnostics v_breakdown = row_count;

  -- 4. Resources (kaynaklar) follow their course; task links are untouched.
  update public.student_resources r set course_id = x.new_course from m0133_resources x where r.id = x.id;
  get diagnostics v_resources = row_count;

  -- 5. Per-resource progress (Soru Çözümü matrix): unique (student, topic, resource) -- a resource belongs to one course, so its rows cannot
  --    collide; if they ever did, the unique constraint aborts the whole block.
  update public.student_resource_progress p set course_id = x.new_course, topic_id = x.new_topic from m0133_progress x where p.id = x.id;
  get diagnostics v_progress = row_count;

  -- 6. Konu İşleyiş Borusu ticks: unique (student, course, topic). A tick on either copy stays ticked (OR-ed into the survivor).
  update public.yks_topic_pipeline_status s
  set konu_calismasi = s.konu_calismasi or agg.konu_calismasi,
      cikmis_sorular = s.cikmis_sorular or agg.cikmis_sorular,
      okul_ilerlemesi = s.okul_ilerlemesi or agg.okul_ilerlemesi
  from (
    select sv.survivor_id, bool_or(p.konu_calismasi) as konu_calismasi, bool_or(p.cikmis_sorular) as cikmis_sorular,
           bool_or(p.okul_ilerlemesi) as okul_ilerlemesi
    from m0133_pipeline_sv sv join public.yks_topic_pipeline_status p on p.id = sv.moved_id
    where sv.moved_id <> sv.survivor_id
    group by sv.survivor_id
  ) agg
  where s.id = agg.survivor_id;
  delete from public.yks_topic_pipeline_status p using m0133_pipeline_sv sv
    where p.id = sv.moved_id and sv.moved_id <> sv.survivor_id;
  get diagnostics v_pipeline_merged = row_count;
  update public.yks_topic_pipeline_status p set course_id = x.new_course, topic_id = x.new_topic
    from m0133_pipeline x join m0133_pipeline_sv sv on sv.moved_id = x.id
    where p.id = x.id and sv.moved_id = sv.survivor_id;
  get diagnostics v_pipeline = row_count;

  -- 7. student_topic_stats is a derived cache (written by recompute_student_topic_stats, never by a trigger): drop the old-id buckets and
  --    rebuild every bucket of the unified courses from the tasks, with the rule that function uses (done / half_done, coach-assigned or
  --    approved; a task with no topic counts under 'karma').
  delete from public.student_topic_stats where course_id in (select old_id from m0133_courses);
  insert into public.student_topic_stats (student_id, course_id, topic_id, total_count, correct_count, wrong_count, empty_count)
  select b.student_id, b.course_id, b.topic_id,
         coalesce(sum(t.total_count), 0), coalesce(sum(t.correct_count), 0),
         coalesce(sum(t.wrong_count), 0), coalesce(sum(t.empty_count), 0)
  from (
    select distinct student_id, course_id, coalesce(topic_id, 'karma') as topic_id
    from public.student_tasks where course_id in (select new_id from m0133_courses)
  ) b
  left join public.student_tasks t
    on t.student_id = b.student_id and t.course_id = b.course_id and coalesce(t.topic_id, 'karma') = b.topic_id
   and t.total_count is not null and t.status in ('done', 'half_done') and (t.is_coach_assigned or t.is_approved_by_coach)
  group by b.student_id, b.course_id, b.topic_id
  on conflict (student_id, course_id, topic_id) do update set
    total_count = excluded.total_count, correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count, empty_count = excluded.empty_count, updated_at = now();
  get diagnostics v_stats_rebuilt = row_count;

  -- 8. Checks. Any failure raises -> the whole block rolls back.
  select count(*) into v_tasks_after from public.student_tasks;
  if v_tasks_after <> v_tasks_before then
    raise exception 'student_tasks row count changed (% -> %) -- rolled back', v_tasks_before, v_tasks_after;
  end if;
  for v_before in select * from m0133_before loop
    select coalesce(sum(total_count), 0) as total, coalesce(sum(correct_count), 0) as correct,
           coalesce(sum(wrong_count), 0) as wrong, coalesce(sum(empty_count), 0) as empty
      into v_after
    from public.student_tasks where student_id = v_before.student_id;
    if v_after.total <> v_before.total or v_after.correct <> v_before.correct
       or v_after.wrong <> v_before.wrong or v_after.empty <> v_before.empty then
      raise exception 'question totals changed for student % (before %/%/%/%, after %/%/%/%) -- rolled back',
        v_before.student_id, v_before.total, v_before.correct, v_before.wrong, v_before.empty,
        v_after.total, v_after.correct, v_after.wrong, v_after.empty;
    end if;
  end loop;

  select
    (select count(*) from public.student_tasks where course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(coalesce(topic_id, '')) <> coalesce(topic_id, ''))
    + (select count(*) from public.student_task_topic_mistakes where course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(topic_id) <> topic_id)
    + (select count(*) from public.student_task_topic_breakdown where course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(topic_id) <> topic_id)
    + (select count(*) from public.student_resources where course_id in (select old_id from m0133_courses))
    + (select count(*) from public.student_resource_progress where course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(topic_id) <> topic_id)
    + (select count(*) from public.yks_topic_pipeline_status where course_id in (select old_id from m0133_courses) or pg_temp.m0133_topic(topic_id) <> topic_id)
    + (select count(*) from public.student_topic_stats where course_id in (select old_id from m0133_courses))
  into v_leftover;
  if v_leftover <> 0 then
    raise exception '% records still carry an old course/topic id -- rolled back', v_leftover;
  end if;

  drop function pg_temp.m0133_topic(text);
  drop function pg_temp.m0133_course(text);

  raise notice 'm0133 done. tasks moved: %; mistakes moved % (duplicates folded: %); breakdown moved % (folded: %); resources moved: %; resource progress moved: %; pipeline moved % (folded: %); stats buckets rebuilt: %',
    v_tasks, v_mistakes, v_mistakes_merged, v_breakdown, v_breakdown_merged, v_resources, v_progress, v_pipeline, v_pipeline_merged, v_stats_rebuilt;
end
$mig$;

notify pgrst, 'reload schema';

-- Verification (read-only): expect old_id_rows = 0 in every row, i.e. no old course id left in any table.
select 'student_tasks' as table_name, count(*) as old_id_rows from public.student_tasks
  where course_id like 'ayt-%-sayisal' or course_id like 'ayt-%-ea' or course_id like 'ayt-%-sozel' or course_id like 'ayt-%-ea-macro' or course_id like 'ayt-%-sozel-macro' or course_id like 'ayt-matematik-sayisal-macro'
union all select 'student_task_topic_mistakes', count(*) from public.student_task_topic_mistakes
  where course_id like 'ayt-%-sayisal' or course_id like 'ayt-%-ea' or course_id like 'ayt-%-sozel' or course_id like 'ayt-%-ea-macro' or course_id like 'ayt-%-sozel-macro' or course_id like 'ayt-matematik-sayisal-macro'
union all select 'student_resources', count(*) from public.student_resources
  where course_id like 'ayt-%-sayisal' or course_id like 'ayt-%-ea' or course_id like 'ayt-%-sozel' or course_id like 'ayt-%-ea-macro' or course_id like 'ayt-%-sozel-macro' or course_id like 'ayt-matematik-sayisal-macro'
union all select 'student_topic_stats', count(*) from public.student_topic_stats
  where course_id like 'ayt-%-sayisal' or course_id like 'ayt-%-ea' or course_id like 'ayt-%-sozel' or course_id like 'ayt-%-ea-macro' or course_id like 'ayt-%-sozel-macro' or course_id like 'ayt-matematik-sayisal-macro';
-- (ayt-fen-sayisal-macro, the combined "AYT Fen", exists in the Sayısal field only and is not touched; its id ends in '-macro' so none of
--  the patterns above match it.)

-- ROLLBACK (only if ever needed; the backups hold the rows exactly as they were):
--   alter table public.student_tasks disable trigger student_tasks_prevent_core_tampering;
--   update public.student_tasks t set course_id = b.course_id, topic_id = b.topic_id from migration_backups.m0133_student_tasks b where t.id = b.id;
--   alter table public.student_tasks enable trigger student_tasks_prevent_core_tampering;
--   (same for student_resources / student_resource_progress; for mistakes, breakdown and pipeline first restore the folded rows with
--    insert ... select * from migration_backups.m0133_<table> b where not exists (select 1 from <table> t where t.id = b.id), then the
--    survivors' original values with update ... from migration_backups.m0133_<table>.)
--   then rebuild student_topic_stats from migration_backups.m0133_topic_stats (or run scripts/backfill-student-topic-stats.mjs).
--   When you are happy: drop schema migration_backups cascade;  (the m0129_* backups live there too -- drop only what you no longer need.)
