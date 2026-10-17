-- Fotoğraf Havuzu: the coach's PRIVATE edited copies of a student's task photos (rotated / drawn on).
--
-- The student's original (student_tasks.evidence_image_paths, bucket `task_evidence`) is never touched: it stays the proof the student sees,
-- the coach approves and the parent sees. A coach's edit is a separate JPEG in its own PRIVATE bucket and a row that points to it:
--
--   storage bucket `coach_annotations`   <coach_id>/<student_id>/<uuid>.jpg, private, 1 MB, JPEG only.
--   public.coach_photo_annotations       (coach_id, student_id, photo_path) -> annotated_path. photo_path is the ORIGINAL's Storage path
--                                        (a photo's id, see 0139); one edited copy per coach and photo (editing again replaces it;
--                                        "Orijinale dön" deletes the row and the file).
--
-- Who can see it: ONLY the coach who made it (and only while the student is on their roster) and admins. There is deliberately NO student and
-- NO parent policy on the table or on the bucket, so a student's or parent's session can neither read the row nor sign / download the file
-- (row level security answers with nothing / denies). Two coaches of one student each keep their own edits, invisible to the other.
-- Safe before or after the app deploy: until this exists the Pool simply has no edit button. Idempotent.
-- Rollback: drop table public.coach_photo_annotations; delete from storage.buckets where id = 'coach_annotations' (empty the bucket first).

-- === 1. Table ================================================================

create table if not exists public.coach_photo_annotations (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  photo_path text not null check (photo_path like student_id::text || '/%' and photo_path not like '%..%'),
  annotated_path text not null check (annotated_path like coach_id::text || '/' || student_id::text || '/%' and annotated_path not like '%..%'),
  updated_at timestamptz not null default now(),
  primary key (coach_id, student_id, photo_path)
);

alter table public.coach_photo_annotations enable row level security;
grant select, insert, update, delete on public.coach_photo_annotations to authenticated;

drop policy if exists "coach_photo_annotations_coach_all" on public.coach_photo_annotations;
create policy "coach_photo_annotations_coach_all" on public.coach_photo_annotations for all to authenticated
  using (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = coach_photo_annotations.student_id)
  )
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = coach_photo_annotations.student_id)
  );

drop policy if exists "coach_photo_annotations_admin_all" on public.coach_photo_annotations;
create policy "coach_photo_annotations_admin_all" on public.coach_photo_annotations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- === 2. Bucket ===============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach_annotations', 'coach_annotations', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/jpeg'];

-- === 3. Storage RLS (coach only; no student / parent policy exists) ==========
-- (storage.objects already has row level security enabled by Supabase.)

drop policy if exists "coach_annotations_coach_insert" on storage.objects;
create policy "coach_annotations_coach_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'coach_annotations'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "coach_annotations_coach_select" on storage.objects;
create policy "coach_annotations_coach_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'coach_annotations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "coach_annotations_coach_delete" on storage.objects;
create policy "coach_annotations_coach_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'coach_annotations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "coach_annotations_admin_all" on storage.objects;
create policy "coach_annotations_admin_all" on storage.objects for all to authenticated
  using (bucket_id = 'coach_annotations' and public.is_admin())
  with check (bucket_id = 'coach_annotations' and public.is_admin());

notify pgrst, 'reload schema';

-- Verification. Expect: the table true; the bucket private (public = false, 1048576); 4 policies named coach_annotations_*
-- (none of them for students).
select to_regclass('public.coach_photo_annotations') is not null as annotations_table;
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'coach_annotations';
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'coach_annotations_%'
order by policyname;
