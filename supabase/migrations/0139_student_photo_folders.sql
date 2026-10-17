-- Fotoğraf Havuzu: the coach's folders for a student's task photos.
--
-- How the photos are stored today: a student's Kanıt Fotoğrafı are NOT rows of their own. They are entries of student_tasks.evidence_image_paths
-- (Storage paths in the private bucket `task_evidence`, <student_id>/<task_id>/<uuid>.jpg -- migration 0087), with the coach's per-photo verdict
-- in student_tasks.evidence_photo_status (0089). A photo's Storage path is unique and never reused, so it IS the photo's id here. Nothing about
-- the tasks, the photos or the bucket changes.
--
-- This adds the coach's way of organising them:
--
--   student_photo_folders        one row per folder: (coach, student, name). Folders belong to the COACH who made them, for one student, so two
--                                coaches of a student arrange the same photos their own way and never see or disturb each other's folders.
--   student_photo_folder_items   photo_path -> folder, one row per (coach, student, photo): a photo sits in at most one of a coach's folders;
--                                "no folder" is simply no row. A composite foreign key ties an item to a folder of the SAME coach and student.
--                                Deleting a folder deletes its item rows only -- its photos go back to "Klasörsüz", never lost.
--
-- Photos deleted by the student (or whole tasks) leave their item rows behind; the app ignores any path that is no longer in a task's list.
-- Row-level security: a coach reads and writes only their own rows and only for a student on their roster; an admin can do everything.
-- Safe before or after the app deploy: until this exists the gallery works without folders and says so. Idempotent.
-- Rollback: drop table public.student_photo_folder_items; drop table public.student_photo_folders;

create table if not exists public.student_photo_folders (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  -- the target of the composite foreign key below
  unique (id, coach_id, student_id)
);

-- One folder name per coach and student, whatever the case ("Deneme" = "deneme").
create unique index if not exists student_photo_folders_unique_name
  on public.student_photo_folders (coach_id, student_id, lower(btrim(name)));

create index if not exists student_photo_folders_student_idx on public.student_photo_folders (coach_id, student_id);

create table if not exists public.student_photo_folder_items (
  coach_id uuid not null,
  student_id uuid not null,
  photo_path text not null check (photo_path like student_id::text || '/%' and photo_path not like '%..%'),
  folder_id uuid not null,
  moved_at timestamptz not null default now(),
  primary key (coach_id, student_id, photo_path),
  foreign key (folder_id, coach_id, student_id)
    references public.student_photo_folders (id, coach_id, student_id) on delete cascade
);

create index if not exists student_photo_folder_items_folder_idx on public.student_photo_folder_items (folder_id);

alter table public.student_photo_folders enable row level security;
alter table public.student_photo_folder_items enable row level security;

grant select, insert, update, delete on public.student_photo_folders to authenticated;
grant select, insert, update, delete on public.student_photo_folder_items to authenticated;

-- A coach: their own rows, for a student on their roster.
drop policy if exists "photo_folders_coach_all" on public.student_photo_folders;
create policy "photo_folders_coach_all" on public.student_photo_folders for all to authenticated
  using (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_photo_folders.student_id)
  )
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_photo_folders.student_id)
  );

drop policy if exists "photo_folder_items_coach_all" on public.student_photo_folder_items;
create policy "photo_folder_items_coach_all" on public.student_photo_folder_items for all to authenticated
  using (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_photo_folder_items.student_id)
  )
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = student_photo_folder_items.student_id)
  );

drop policy if exists "photo_folders_admin_all" on public.student_photo_folders;
create policy "photo_folders_admin_all" on public.student_photo_folders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "photo_folder_items_admin_all" on public.student_photo_folder_items;
create policy "photo_folder_items_admin_all" on public.student_photo_folder_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

-- Verification: expect both tables true.
select
  to_regclass('public.student_photo_folders') is not null as folders_table,
  to_regclass('public.student_photo_folder_items') is not null as items_table;
