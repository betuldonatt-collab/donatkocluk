-- LGS Phase 3 (part 1): daily routines and the topic pipeline checklist.
--
-- Design notes:
--   - lgs_daily_routines: one row per (student, entry_date) -- confirmed
--     one Paragraf session/day, not the two-parallel-block reading I'd
--     originally worried the Excel implied. Kitap Okuma's book
--     title/author live directly on the same daily row (denormalized)
--     rather than a separate book-catalog table -- this migration is
--     scoped to exactly "the daily log," matching what was asked; a
--     fuller multi-book catalog with target finish dates is an easy
--     additive follow-up if it turns out to be wanted later.
--   - lgs_topic_pipeline_status: one row per (student, subject, topic_id),
--     four boolean checkboxes -- Okul İlerlemesi / Konu Tekrarı / MEB
--     Kaynağı / Çıkmış Sorular. Soru Çözümü is deliberately NOT a column
--     here -- that's the existing student_resources/student_resource_progress
--     tables (cohort-agnostic already, course_id is plain text), reused
--     as discussed rather than re-modeled.
--   - topic_id is plain text, no FK -- same convention as every other
--     topic reference in this app (student_task_topic_mistakes, the new
--     lgs_*_topic_mistakes tables): the curriculum itself is static
--     content (lib/curriculum/lgs.json), not a database table to FK
--     against.
--   - Idempotent throughout (IF NOT EXISTS / DROP POLICY IF EXISTS +
--     CREATE), matching 0085/0086 after the local-testing friction there.

create table if not exists public.lgs_daily_routines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,

  paragraf_correct smallint not null default 0 check (paragraf_correct >= 0),
  paragraf_wrong smallint not null default 0 check (paragraf_wrong >= 0),
  paragraf_empty smallint not null default 0 check (paragraf_empty >= 0),
  paragraf_duration_minutes smallint check (paragraf_duration_minutes is null or paragraf_duration_minutes >= 0),

  book_title text,
  book_author text,
  book_pages_read smallint check (book_pages_read is null or book_pages_read >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (student_id, entry_date)
);

create index if not exists lgs_daily_routines_student_idx on public.lgs_daily_routines (student_id, entry_date);

alter table public.lgs_daily_routines enable row level security;
grant select, insert, update, delete on public.lgs_daily_routines to authenticated;

drop policy if exists "lgs_daily_routines_admin_all" on public.lgs_daily_routines;
create policy "lgs_daily_routines_admin_all" on public.lgs_daily_routines for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_daily_routines_student_own" on public.lgs_daily_routines;
create policy "lgs_daily_routines_student_own" on public.lgs_daily_routines for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

drop policy if exists "lgs_daily_routines_coach_all" on public.lgs_daily_routines;
create policy "lgs_daily_routines_coach_all" on public.lgs_daily_routines for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_daily_routines.student_id))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_daily_routines.student_id));

drop policy if exists "lgs_daily_routines_parent_read" on public.lgs_daily_routines;
create policy "lgs_daily_routines_parent_read" on public.lgs_daily_routines for select to authenticated
  using (exists (select 1 from public.parent_students ps where ps.parent_id = (select auth.uid()) and ps.student_id = lgs_daily_routines.student_id));

create table if not exists public.lgs_topic_pipeline_status (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject public.lgs_subject not null,
  topic_id text not null,

  okul_ilerlemesi boolean not null default false,
  konu_tekrari boolean not null default false,
  meb_kaynagi boolean not null default false,
  cikmis_sorular boolean not null default false,

  updated_at timestamptz not null default now(),

  unique (student_id, subject, topic_id)
);

create index if not exists lgs_topic_pipeline_status_student_idx on public.lgs_topic_pipeline_status (student_id, subject);

alter table public.lgs_topic_pipeline_status enable row level security;
grant select, insert, update, delete on public.lgs_topic_pipeline_status to authenticated;

drop policy if exists "lgs_topic_pipeline_status_admin_all" on public.lgs_topic_pipeline_status;
create policy "lgs_topic_pipeline_status_admin_all" on public.lgs_topic_pipeline_status for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_topic_pipeline_status_student_own" on public.lgs_topic_pipeline_status;
create policy "lgs_topic_pipeline_status_student_own" on public.lgs_topic_pipeline_status for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

drop policy if exists "lgs_topic_pipeline_status_coach_all" on public.lgs_topic_pipeline_status;
create policy "lgs_topic_pipeline_status_coach_all" on public.lgs_topic_pipeline_status for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_topic_pipeline_status.student_id))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_topic_pipeline_status.student_id));

drop policy if exists "lgs_topic_pipeline_status_parent_read" on public.lgs_topic_pipeline_status;
create policy "lgs_topic_pipeline_status_parent_read" on public.lgs_topic_pipeline_status for select to authenticated
  using (exists (select 1 from public.parent_students ps where ps.parent_id = (select auth.uid()) and ps.student_id = lgs_topic_pipeline_status.student_id));

notify pgrst, 'reload schema';
