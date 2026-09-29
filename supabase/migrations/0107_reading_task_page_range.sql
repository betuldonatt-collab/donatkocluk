-- Kitap Okuma (task_type = 'reading') stops using Kanıt Fotoğrafı as its
-- completion proof and switches to a page range instead: the student
-- enters Başlangıç Sayfası / Bitiş Sayfası, and correct_count (already the
-- "Okunan Sayfa" total that drives completion status, see
-- computeAutoTaskStatus) is derived from it client- and server-side as
-- (end_page - start_page + 1). These two columns just keep the range
-- itself around, for a richer coach view than a bare page count -- nothing
-- else reads or writes them, and total_pages_read is deliberately NOT a
-- separate column: it would only ever equal correct_count, and a second
-- column that must always agree with a first is exactly how the two drift.
alter table public.student_tasks
  add column start_page int,
  add column end_page int;

-- Both null (not a reading task, or not entered yet) or both a valid,
-- ordered range -- never a lone start/end, and never end < start. Mirrors
-- the same rule enforced client-side (task-modal.tsx) and re-validated in
-- updateTaskProgress before this ever reaches the database.
alter table public.student_tasks
  add constraint student_tasks_page_range_valid check (
    (start_page is null and end_page is null)
    or (start_page is not null and end_page is not null and start_page > 0 and end_page >= start_page)
  );

notify pgrst, 'reload schema';

-- Verification: new columns exist and the range check is in place (expect true).
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_tasks' and column_name = 'start_page'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_tasks' and column_name = 'end_page'
  )
  and exists (
    select 1 from pg_constraint where conname = 'student_tasks_page_range_valid'
  ) as reading_page_range_ready;
