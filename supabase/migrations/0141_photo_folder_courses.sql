-- Fotoğraf Havuzu: folders now live UNDER a course (Matematik > Soru Bankası, Fen Bilimleri > Soru Bankası, ...).
--
--   student_photo_folders.course_key  text, null | the course the folder belongs to, in the SAME key the Pool groups its photos by:
--                                     the task's course id ('tyt-matematik', 'lgs-fen', 'paragraf', ...), 'genel-deneme' for a Genel Deneme,
--                                     'diger' for a task without a course. A key (not the display name) so a renamed or duplicated display
--                                     name never splits a course in two.
--
-- Existing folders (migration 0139 made them flat): each one is moved under its course when ALL of its photos belong to one course; a folder
-- that is empty or mixes courses stays with course_key = null and the Pool lists it under "Dersi olmayan klasörler" (rename / delete only).
--
-- The unique name rule becomes per course: one folder name per coach, student AND course (case-insensitive), so "Soru Bankası" can exist in
-- Matematik and again in Fen Bilimleri. (Folders without a course still share one name space, as before.)
--
-- Safe before or after the app deploy: until this column exists the Pool reads the folders without it (all flat, "Dersi olmayan klasörler")
-- and says new course folders need this update. Idempotent. Rollback: restore the old index (coach_id, student_id, lower(btrim(name))) and
-- drop the column -- only if no two courses share a folder name.

alter table public.student_photo_folders
  add column if not exists course_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_photo_folders'::regclass and conname = 'student_photo_folders_course_key_check'
  ) then
    alter table public.student_photo_folders
      add constraint student_photo_folders_course_key_check check (course_key is null or char_length(course_key) between 1 and 80);
  end if;
end
$$;

-- Backfill: a folder whose photos all belong to one course moves under that course. (A photo's course comes from its task: a Genel Deneme is
-- 'genel-deneme', no course is 'diger', otherwise the course id -- the same rule the app uses.) Only folders still without a course are touched.
update public.student_photo_folders f
set course_key = x.k
from (
  select
    i.folder_id,
    min(case when t.task_type = 'general_exam' then 'genel-deneme' when t.course_id is null then 'diger' else t.course_id end) as k,
    count(distinct case when t.task_type = 'general_exam' then 'genel-deneme' when t.course_id is null then 'diger' else t.course_id end) as n
  from public.student_photo_folder_items i
  join public.student_tasks t on t.student_id = i.student_id and i.photo_path = any (t.evidence_image_paths)
  group by i.folder_id
) x
where f.id = x.folder_id
  and f.course_key is null
  and x.n = 1
  and char_length(x.k) between 1 and 80;

-- One folder name per coach, student and course.
drop index if exists public.student_photo_folders_unique_name;
create unique index if not exists student_photo_folders_unique_name_per_course
  on public.student_photo_folders (coach_id, student_id, coalesce(course_key, ''), lower(btrim(name)));

create index if not exists student_photo_folders_course_idx on public.student_photo_folders (coach_id, student_id, course_key);

notify pgrst, 'reload schema';

-- Verification: expect column_exists = true; the per-course index present and the old one gone; and the folders split into
-- under_a_course / still_without_a_course.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'student_photo_folders' and column_name = 'course_key') as column_exists,
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'student_photo_folders_unique_name_per_course') as per_course_index,
  not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'student_photo_folders_unique_name') as old_index_gone,
  (select count(*) from public.student_photo_folders where course_key is not null) as under_a_course,
  (select count(*) from public.student_photo_folders where course_key is null) as still_without_a_course;
