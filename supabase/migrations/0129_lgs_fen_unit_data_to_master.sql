-- LGS Fen Bilimleri, Ünite 1-6: move the old "whole unit" records onto the unit's new "(Genel)" master topic.
--
-- WHY. Until the Fen two-step picker (Ünite -> Konu), Fen Ünite 1-6 were ONE selectable entry each, whose id was the unit's
-- FIRST topic ("lgs-fen-bilimleri-u0-t0" for Ünite 1, ...). Everything a student or coach recorded for "the unit" -- tasks and
-- their question counts, exam mistakes, Kaynak Takibi ticks and per-resource counts -- is saved under that id. The unit now has
-- one entry per Konu plus a "(Genel)" master (id "lgs-fen-bilimleri-genel-u<n>"), so that id has become just the first Konu:
-- left alone, the first Konu would show the whole unit's numbers. This moves those records to the master, so the first Konu
-- is empty again and the unit totals (the Kaynak Takibi parent row) stay exactly the same.
-- (One thing a script cannot know: a record saved before the 2026-09-29 Konu/Ünite rollup, when every raw topic was
-- pickable, may have meant the first Konu alone. Those are moved too, as the unit's own data, like everything else on that id.)
--
-- WHAT MOVES (course_id = 'lgs-fen-bilimleri', topic_id lgs-fen-bilimleri-u<n>-t0 -> lgs-fen-bilimleri-genel-u<n>, n = 0..5):
--   student_tasks, student_task_topic_mistakes, student_task_topic_breakdown, student_resource_progress,
--   lgs_topic_pipeline_status; student_topic_stats (the derived cache) is recomputed for every bucket involved.
--   (coach_task_templates is NOT part of it: migration 0043 dropped that table.)
-- WHAT DOES NOT MOVE: Ünite 7 (its entries did not change); any other topic id of Ünite 1-6 (a record saved under, say,
--   "lgs-fen-bilimleri-u2-t1" names that Konu exactly and now shows under it); every other course; archived Karne snapshots
--   (student_report_cards.topic_mistakes is a snapshot by design).
--
-- CUTOFF. Only records saved BEFORE the Konu picker went live are moved, so a record a student/coach made on the new "first
-- Konu" row afterwards stays where it is. Default = the push of the picker (commit 52fba97, 2026-10-07 03:22:55 +03:00); raise
-- it to the moment the new version was actually deployed if you want to be exact. Tables use their own timestamp
-- (created_at, or updated_at for the two tick tables). Rows left behind because they are newer are listed in the NOTICE
-- output at the end.
--
-- SAFETY.
--   * One DO block = one transaction: any error, or a failed check at the end, rolls EVERYTHING back (including the
--     temporary trigger switch-off).
--   * Before touching anything it copies each row it is about to change into schema migration_backups (not exposed through
--     the API), tables m0129_*. Rollback recipe at the bottom.
--   * Merging, never overwriting: if a master row already exists for the same key (student+resource, student+topic, task+topic
--     +status ...), the old row is folded into it (ticks OR-ed, counts added) and removed -- nothing is lost.
--   * student_tasks has a guard trigger (prevent_student_task_core_tampering) that forbids changing a coach-assigned task's
--     topic from anything but a coach/admin session; this script runs as the database owner, so that one trigger is switched off
--     for the single UPDATE and switched on again straight after.
--   * A final check compares the Fen question totals per student before/after (must be identical) and that no pre-cutoff
--     record is left on an old id; otherwise it raises and rolls back.
--
-- Run it ONCE, in the SQL editor, at a quiet moment (it briefly locks student_tasks). Idempotent: running it again finds nothing
-- left to move.

do $mig$
declare
  v_tasks int := 0;
  v_mistakes_moved int := 0;
  v_mistakes_merged int := 0;
  v_breakdown_moved int := 0;
  v_breakdown_merged int := 0;
  v_progress_moved int := 0;
  v_progress_merged int := 0;
  v_pipeline_moved int := 0;
  v_pipeline_merged int := 0;
  v_left_newer int := 0;
  v_before record;
  v_after record;
  v_leftover int;
begin
  create temporary table m0129_params (cutoff timestamptz not null) on commit drop;
  insert into m0129_params values (timestamptz '2026-10-07 03:22:55+03');

  create temporary table m0129_map (old_id text primary key, new_id text not null) on commit drop;
  insert into m0129_map
    select 'lgs-fen-bilimleri-u' || n || '-t0', 'lgs-fen-bilimleri-genel-u' || n from generate_series(0, 5) as n;

  -- Fen question totals per student before the move: the invariant checked at the end.
  create temporary table m0129_before on commit drop as
    select student_id,
           coalesce(sum(total_count), 0) as total, coalesce(sum(correct_count), 0) as correct,
           coalesce(sum(wrong_count), 0) as wrong, coalesce(sum(empty_count), 0) as empty
    from public.student_tasks
    where course_id = 'lgs-fen-bilimleri'
    group by student_id;

  -- The rows to move (decided once, up front).
  create temporary table m0129_tasks on commit drop as
    select t.id, m.new_id
    from public.student_tasks t join m0129_map m on m.old_id = t.topic_id
    where t.course_id = 'lgs-fen-bilimleri' and t.created_at < (select cutoff from m0129_params);

  create temporary table m0129_mistakes on commit drop as
    select k.id, m.new_id
    from public.student_task_topic_mistakes k join m0129_map m on m.old_id = k.topic_id
    where k.course_id = 'lgs-fen-bilimleri' and k.created_at < (select cutoff from m0129_params);

  create temporary table m0129_breakdown on commit drop as
    select b.id, m.new_id
    from public.student_task_topic_breakdown b join m0129_map m on m.old_id = b.topic_id
    where b.course_id = 'lgs-fen-bilimleri' and b.created_at < (select cutoff from m0129_params);

  create temporary table m0129_progress on commit drop as
    select p.id, m.new_id
    from public.student_resource_progress p join m0129_map m on m.old_id = p.topic_id
    where p.course_id = 'lgs-fen-bilimleri' and p.updated_at < (select cutoff from m0129_params);

  create temporary table m0129_pipeline on commit drop as
    select p.id, m.new_id
    from public.lgs_topic_pipeline_status p join m0129_map m on m.old_id = p.topic_id
    where p.course_id = 'lgs-fen-bilimleri' and p.updated_at < (select cutoff from m0129_params);

  -- Backups of exactly the rows about to change.
  create schema if not exists migration_backups;
  create table if not exists migration_backups.m0129_student_tasks as
    select t.* from public.student_tasks t where t.id in (select id from m0129_tasks);
  create table if not exists migration_backups.m0129_mistakes as
    select k.* from public.student_task_topic_mistakes k where k.id in (select id from m0129_mistakes);
  create table if not exists migration_backups.m0129_breakdown as
    select b.* from public.student_task_topic_breakdown b where b.id in (select id from m0129_breakdown);
  create table if not exists migration_backups.m0129_resource_progress as
    select p.* from public.student_resource_progress p where p.id in (select id from m0129_progress);
  create table if not exists migration_backups.m0129_pipeline as
    select p.* from public.lgs_topic_pipeline_status p where p.id in (select id from m0129_pipeline);
  create table if not exists migration_backups.m0129_topic_stats as
    select s.* from public.student_topic_stats s
    where s.course_id = 'lgs-fen-bilimleri'
      and s.topic_id in (select old_id from m0129_map union select new_id from m0129_map);
  revoke all on all tables in schema migration_backups from anon, authenticated;

  -- 1. Tasks. The guard trigger is off for this one statement only.
  alter table public.student_tasks disable trigger student_tasks_prevent_core_tampering;
  update public.student_tasks t set topic_id = x.new_id from m0129_tasks x where t.id = x.id;
  get diagnostics v_tasks = row_count;
  alter table public.student_tasks enable trigger student_tasks_prevent_core_tampering;

  -- 2. Exam mistakes: unique (task, course, topic, status) -- a mark already on the master absorbs the old one.
  delete from public.student_task_topic_mistakes k
  using m0129_mistakes x
  where k.id = x.id
    and exists (
      select 1 from public.student_task_topic_mistakes d
      where d.task_id = k.task_id and d.course_id = k.course_id and d.topic_id = x.new_id and d.status = k.status
    );
  get diagnostics v_mistakes_merged = row_count;
  update public.student_task_topic_mistakes k set topic_id = x.new_id from m0129_mistakes x where k.id = x.id;
  get diagnostics v_mistakes_moved = row_count;

  -- 3. Per-task topic breakdown: unique (task, topic) -- counts are added into the master's row.
  update public.student_task_topic_breakdown d
  set total_questions = d.total_questions + b.total_questions,
      correct_answers = d.correct_answers + b.correct_answers,
      incorrect_answers = d.incorrect_answers + b.incorrect_answers
  from m0129_breakdown x
  join public.student_task_topic_breakdown b on b.id = x.id
  where d.task_id = b.task_id and d.topic_id = x.new_id;
  delete from public.student_task_topic_breakdown b
  using m0129_breakdown x
  where b.id = x.id
    and exists (select 1 from public.student_task_topic_breakdown d where d.task_id = b.task_id and d.topic_id = x.new_id);
  get diagnostics v_breakdown_merged = row_count;
  update public.student_task_topic_breakdown b set topic_id = x.new_id from m0129_breakdown x where b.id = x.id;
  get diagnostics v_breakdown_moved = row_count;

  -- 4. Per-resource progress (Soru Çözümü matrix): unique (student, topic, resource) -- ticks OR-ed, counts added.
  update public.student_resource_progress d
  set solved = d.solved or p.solved,
      reviewed = d.reviewed or p.reviewed,
      total_questions = case when d.total_questions is null and p.total_questions is null then null
                             else coalesce(d.total_questions, 0) + coalesce(p.total_questions, 0) end,
      correct_answers = case when d.correct_answers is null and p.correct_answers is null then null
                             else coalesce(d.correct_answers, 0) + coalesce(p.correct_answers, 0) end,
      incorrect_answers = case when d.incorrect_answers is null and p.incorrect_answers is null then null
                               else coalesce(d.incorrect_answers, 0) + coalesce(p.incorrect_answers, 0) end
  from m0129_progress x
  join public.student_resource_progress p on p.id = x.id
  where d.student_id = p.student_id and d.resource_id = p.resource_id and d.topic_id = x.new_id;
  delete from public.student_resource_progress p
  using m0129_progress x
  where p.id = x.id
    and exists (
      select 1 from public.student_resource_progress d
      where d.student_id = p.student_id and d.resource_id = p.resource_id and d.topic_id = x.new_id
    );
  get diagnostics v_progress_merged = row_count;
  update public.student_resource_progress p set topic_id = x.new_id from m0129_progress x where p.id = x.id;
  get diagnostics v_progress_moved = row_count;

  -- 5. Konu İşleyiş Borusu ticks: unique (student, course, topic) -- ticks OR-ed.
  update public.lgs_topic_pipeline_status d
  set okul_ilerlemesi = d.okul_ilerlemesi or p.okul_ilerlemesi,
      konu_tekrari = d.konu_tekrari or p.konu_tekrari,
      meb_kaynagi = d.meb_kaynagi or p.meb_kaynagi,
      cikmis_sorular = d.cikmis_sorular or p.cikmis_sorular
  from m0129_pipeline x
  join public.lgs_topic_pipeline_status p on p.id = x.id
  where d.student_id = p.student_id and d.course_id = p.course_id and d.topic_id = x.new_id;
  delete from public.lgs_topic_pipeline_status p
  using m0129_pipeline x
  where p.id = x.id
    and exists (
      select 1 from public.lgs_topic_pipeline_status d
      where d.student_id = p.student_id and d.course_id = p.course_id and d.topic_id = x.new_id
    );
  get diagnostics v_pipeline_merged = row_count;
  update public.lgs_topic_pipeline_status p set topic_id = x.new_id from m0129_pipeline x where p.id = x.id;
  get diagnostics v_pipeline_moved = row_count;

  -- 6. student_topic_stats is a derived cache (written by recompute_student_topic_stats, never by a trigger): rebuild every
  --    bucket involved with the same rule that function uses -- done / half_done, coach-assigned or approved.
  insert into public.student_topic_stats (student_id, course_id, topic_id, total_count, correct_count, wrong_count, empty_count)
  select b.student_id, b.course_id, b.topic_id,
         coalesce(sum(t.total_count), 0), coalesce(sum(t.correct_count), 0),
         coalesce(sum(t.wrong_count), 0), coalesce(sum(t.empty_count), 0)
  from (
    select student_id, course_id, topic_id from public.student_topic_stats
      where course_id = 'lgs-fen-bilimleri' and topic_id in (select old_id from m0129_map union select new_id from m0129_map)
    union
    select student_id, course_id, topic_id from public.student_tasks
      where course_id = 'lgs-fen-bilimleri' and topic_id in (select new_id from m0129_map)
  ) b
  left join public.student_tasks t
    on t.student_id = b.student_id and t.course_id = b.course_id and coalesce(t.topic_id, 'karma') = b.topic_id
   and t.total_count is not null and t.status in ('done', 'half_done') and (t.is_coach_assigned or t.is_approved_by_coach)
  group by b.student_id, b.course_id, b.topic_id
  on conflict (student_id, course_id, topic_id) do update set
    total_count = excluded.total_count, correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count, empty_count = excluded.empty_count, updated_at = now();

  -- 7. Checks. Any failure raises -> the whole block rolls back.
  for v_before in select * from m0129_before loop
    select coalesce(sum(total_count), 0) as total, coalesce(sum(correct_count), 0) as correct,
           coalesce(sum(wrong_count), 0) as wrong, coalesce(sum(empty_count), 0) as empty
      into v_after
    from public.student_tasks
    where course_id = 'lgs-fen-bilimleri' and student_id = v_before.student_id;
    if v_after.total <> v_before.total or v_after.correct <> v_before.correct
       or v_after.wrong <> v_before.wrong or v_after.empty <> v_before.empty then
      raise exception 'Fen question totals changed for student % (before %/%/%/%, after %/%/%/%) -- rolled back',
        v_before.student_id, v_before.total, v_before.correct, v_before.wrong, v_before.empty,
        v_after.total, v_after.correct, v_after.wrong, v_after.empty;
    end if;
  end loop;

  select
    (select count(*) from public.student_tasks t join m0129_map m on m.old_id = t.topic_id
       where t.course_id = 'lgs-fen-bilimleri' and t.created_at < (select cutoff from m0129_params))
    + (select count(*) from public.student_task_topic_mistakes k join m0129_map m on m.old_id = k.topic_id
       where k.course_id = 'lgs-fen-bilimleri' and k.created_at < (select cutoff from m0129_params))
    + (select count(*) from public.student_task_topic_breakdown b join m0129_map m on m.old_id = b.topic_id
       where b.course_id = 'lgs-fen-bilimleri' and b.created_at < (select cutoff from m0129_params))
    + (select count(*) from public.student_resource_progress p join m0129_map m on m.old_id = p.topic_id
       where p.course_id = 'lgs-fen-bilimleri' and p.updated_at < (select cutoff from m0129_params))
    + (select count(*) from public.lgs_topic_pipeline_status p join m0129_map m on m.old_id = p.topic_id
       where p.course_id = 'lgs-fen-bilimleri' and p.updated_at < (select cutoff from m0129_params))
  into v_leftover;
  if v_leftover <> 0 then
    raise exception '% pre-cutoff records are still on an old id -- rolled back', v_leftover;
  end if;

  -- Newer records deliberately left where they are (made on the new first-Konu row).
  select
    (select count(*) from public.student_tasks t join m0129_map m on m.old_id = t.topic_id where t.course_id = 'lgs-fen-bilimleri')
    + (select count(*) from public.student_task_topic_mistakes k join m0129_map m on m.old_id = k.topic_id where k.course_id = 'lgs-fen-bilimleri')
    + (select count(*) from public.student_task_topic_breakdown b join m0129_map m on m.old_id = b.topic_id where b.course_id = 'lgs-fen-bilimleri')
    + (select count(*) from public.student_resource_progress p join m0129_map m on m.old_id = p.topic_id where p.course_id = 'lgs-fen-bilimleri')
    + (select count(*) from public.lgs_topic_pipeline_status p join m0129_map m on m.old_id = p.topic_id where p.course_id = 'lgs-fen-bilimleri')
  into v_left_newer;

  raise notice 'm0129 done. student_tasks moved: %; mistakes moved % (merged into existing master marks: %); breakdown moved % (merged %); resource progress moved % (merged %); pipeline moved % (merged %); newer records left on the first Konu: %',
    v_tasks, v_mistakes_moved, v_mistakes_merged, v_breakdown_moved, v_breakdown_merged,
    v_progress_moved, v_progress_merged, v_pipeline_moved, v_pipeline_merged, v_left_newer;
end
$mig$;

notify pgrst, 'reload schema';

-- Verification (read-only): what is left on each unit's first topic vs. its master. Expect old_id counts of 0 (or only
-- records newer than the cutoff) and the unit's former numbers on the master.
select m.old_id, m.new_id,
       (select count(*) from public.student_tasks where course_id = 'lgs-fen-bilimleri' and topic_id = m.old_id) as tasks_on_first_konu,
       (select count(*) from public.student_tasks where course_id = 'lgs-fen-bilimleri' and topic_id = m.new_id) as tasks_on_master,
       (select count(*) from public.student_task_topic_mistakes where course_id = 'lgs-fen-bilimleri' and topic_id = m.old_id) as mistakes_on_first_konu,
       (select count(*) from public.student_task_topic_mistakes where course_id = 'lgs-fen-bilimleri' and topic_id = m.new_id) as mistakes_on_master
from (values
  ('lgs-fen-bilimleri-u0-t0', 'lgs-fen-bilimleri-genel-u0'), ('lgs-fen-bilimleri-u1-t0', 'lgs-fen-bilimleri-genel-u1'),
  ('lgs-fen-bilimleri-u2-t0', 'lgs-fen-bilimleri-genel-u2'), ('lgs-fen-bilimleri-u3-t0', 'lgs-fen-bilimleri-genel-u3'),
  ('lgs-fen-bilimleri-u4-t0', 'lgs-fen-bilimleri-genel-u4'), ('lgs-fen-bilimleri-u5-t0', 'lgs-fen-bilimleri-genel-u5')
) as m (old_id, new_id)
order by m.old_id;

-- ROLLBACK (only if ever needed; the backups hold the rows exactly as they were):
--   alter table public.student_tasks disable trigger student_tasks_prevent_core_tampering;
--   update public.student_tasks t set topic_id = b.topic_id from migration_backups.m0129_student_tasks b where t.id = b.id;
--   alter table public.student_tasks enable trigger student_tasks_prevent_core_tampering;
--   update public.student_task_topic_mistakes k set topic_id = b.topic_id from migration_backups.m0129_mistakes b where k.id = b.id;
--   insert into public.student_task_topic_mistakes select * from migration_backups.m0129_mistakes b
--     where not exists (select 1 from public.student_task_topic_mistakes k where k.id = b.id);   -- rows removed by a merge
--   (same two statements, per table, for m0129_breakdown / m0129_resource_progress / m0129_pipeline -- then restore the merged-into
--    master rows' counts/ticks from your own knowledge or drop the merged increments)
--   then rebuild student_topic_stats from migration_backups.m0129_topic_stats (or run scripts/backfill-student-topic-stats.mjs).
--   When you are happy: drop schema migration_backups cascade;
