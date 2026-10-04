-- A topic can be marked BOTH Yanlış and Boş in the same exam (one question
-- answered wrong, another left blank). 0006 made
-- (task_id, course_id, topic_id) unique, so a topic could hold only one row,
-- and therefore only one status. The status becomes part of the key instead:
-- one row per (topic, status), so a topic with both marks has two rows.
--
-- Every existing row already satisfies the new key (it was unique on a
-- subset of these columns), so nothing is rewritten. The app writes exactly
-- one row per mark, never two rows with the same status.
--
-- Rollback (only valid while no topic carries both marks -- otherwise merge
-- those rows first):
--   alter table public.student_task_topic_mistakes
--     drop constraint student_task_topic_mistakes_task_course_topic_status_key;
--   alter table public.student_task_topic_mistakes
--     add constraint student_task_topic_mistakes_task_id_course_id_topic_id_key
--     unique (task_id, course_id, topic_id);

-- Drop whichever unique constraint covers exactly (task_id, course_id,
-- topic_id), whatever Postgres named it.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.student_task_topic_mistakes'::regclass
      and con.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from pg_attribute a
        where a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      ) = array['course_id', 'task_id', 'topic_id']::name[]
  loop
    execute format('alter table public.student_task_topic_mistakes drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.student_task_topic_mistakes
  drop constraint if exists student_task_topic_mistakes_task_course_topic_status_key;
alter table public.student_task_topic_mistakes
  add constraint student_task_topic_mistakes_task_course_topic_status_key
  unique (task_id, course_id, topic_id, status);

notify pgrst, 'reload schema';

-- Verification: expect exactly one unique constraint, covering the four columns.
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid = 'public.student_task_topic_mistakes'::regclass
  and con.contype = 'u';
