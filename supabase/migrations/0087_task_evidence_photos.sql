-- =============================================================================
-- Kanıt Fotoğrafı: a student can attach photos of their finished work (e.g. a
-- solved test page) to a task; the coach reviews them.
--
--   * student_tasks.evidence_image_paths  text[] of Storage object paths (NOT
--     URLs: the bucket is private and every view goes through a short-lived
--     signed URL, so a stored URL would just expire). No limit on the count.
--   * Storage bucket `task_evidence` (private, 2 MB per file, images only).
--       object path = <student_id>/<task_id>/<random>.jpg
--     Photos are compressed in the browser before upload, so real files are a
--     few hundred KB; the 2 MB cap is only a backstop.
--   * storage.objects RLS for that bucket:
--       - a student may upload into their OWN folder, and only for a task that is
--         theirs; read and delete their own photos;
--       - a coach may read (not write) the photos of students on their roster;
--       - an admin may do everything.
--
-- Photos are removed from Storage when a student deletes one; deleting a whole
-- task leaves its files behind (Postgres cannot delete Storage blobs safely from
-- a trigger) -- harmless, they stay private.
-- Idempotent: safe to run more than once.
-- =============================================================================

-- === 1. Column ===============================================================

alter table public.student_tasks
  add column if not exists evidence_image_paths text[] not null default '{}';

-- (An earlier version of this file capped the array at 3; that constraint is
-- dropped here and in 0088 so re-running either file never re-adds it.)
alter table public.student_tasks
  drop constraint if exists student_tasks_evidence_image_paths_max;

-- === 2. Bucket ===============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task_evidence', 'task_evidence', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- === 3. Storage RLS ==========================================================
-- (storage.objects already has row level security enabled by Supabase.)

drop policy if exists "task_evidence_student_insert" on storage.objects;
create policy "task_evidence_student_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task_evidence'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.student_tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.student_id = (select auth.uid())
    )
  );

drop policy if exists "task_evidence_student_select" on storage.objects;
create policy "task_evidence_student_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'task_evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "task_evidence_student_delete" on storage.objects;
create policy "task_evidence_student_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'task_evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "task_evidence_coach_select" on storage.objects;
create policy "task_evidence_coach_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'task_evidence'
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "task_evidence_admin_all" on storage.objects;
create policy "task_evidence_admin_all" on storage.objects for all to authenticated
  using (bucket_id = 'task_evidence' and public.is_admin())
  with check (bucket_id = 'task_evidence' and public.is_admin());

notify pgrst, 'reload schema';

-- Verification. Expect: bucket row with public = false and 2097152; the column row;
-- and 5 policies whose names start with task_evidence_.
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'task_evidence';

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'student_tasks' and column_name = 'evidence_image_paths';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'task_evidence_%'
order by policyname;
