-- =============================================================================
-- LGS (8th grade) cohort + per-topic learning pipelines (LGS and YKS) --
-- FINAL, CONSOLIDATED schema.
--
-- Replaces the old 0085 / 0086 / 0087 / 0088 / 0089 sequence (archived under
-- supabase/archive/lgs-superseded/). Run this ONE file, on either:
--   * a fresh database (only 0001..0084 applied), or
--   * a database where any subset of the old LGS migrations already ran --
--     it converges to the same end state either way.
--
-- Idempotent: every statement is IF [NOT] EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS + CREATE, so it can be re-run safely.
--
-- END STATE
--   enum    public.exam_type ('YKS','LGS')
--   profiles: exam_type + LGS goal / intake / school-exam-date columns
--   signup_requests.exam_type
--   trigger function prevent_student_system_field_tampering (exam_type is an
--     admin-only system field)
--   public.lgs_daily_routines        -- Paragraf + Kitap Okuma daily log
--   public.lgs_topic_pipeline_status -- LGS pipeline: Okul İlerlemesi, Konu
--                                       Tekrarı, MEB Kaynağı, Çıkmış Sorular
--   public.yks_topic_pipeline_status -- YKS pipeline: Konu Çalışması,
--                                       Çıkmış Sorular
--   (In the Kaynak Takibi table the first steps sit right after the topic
--   name and the last ones after the resource columns -- a UI concern; the
--   tables just hold one boolean per step.)
--
-- DELIBERATELY ABSENT (LGS reuses the YKS tables instead -- student_tasks,
-- student_task_topic_mistakes, student_resources, ...): lgs_tasks,
-- lgs_general_exams, lgs_branch_exams, lgs_*_topic_mistakes, enum lgs_subject.
-- They are dropped below if an earlier run created them (and are empty).
-- =============================================================================

-- === 1. Cohort flag ==========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_type') then
    create type public.exam_type as enum ('YKS', 'LGS');
  end if;
end $$;

-- NOT NULL default 'YKS': every existing student keeps today's behavior.
alter table public.profiles
  add column if not exists exam_type public.exam_type not null default 'YKS';

-- Carried from the public signup form to account approval
-- (approveSignupRequest, app/admin/actions.ts). Null for parent/coach signups.
alter table public.signup_requests
  add column if not exists exam_type public.exam_type;

-- === 2. LGS profile fields ===================================================
-- Ordinary academic-profile fields (self/coach-editable), so deliberately NOT
-- in the tampering guard below -- same reach as target_university (0009).

-- Goals ("Hedef Lise" / "Hedef Yüzdelik Dilim" / scores).
alter table public.profiles
  add column if not exists target_high_school text,
  add column if not exists target_percentile numeric(5, 2),
  add column if not exists target_score numeric(6, 2),
  add column if not exists report_card_average numeric(5, 2),
  add column if not exists target_report_card_average numeric(5, 2);

-- Intake. has_private_tutor / attends_dershane / had_previous_coaching /
-- favorite_subjects / difficult_subjects already exist (0009) and are reused;
-- only the daily study hours are new.
alter table public.profiles
  add column if not exists avg_daily_study_hours numeric(4, 1);

-- School written-exam dates ("Yazılı Tarihleri"): one shared date per
-- Dönem x Yazılı slot.
alter table public.profiles
  add column if not exists term1_exam1_date date,
  add column if not exists term1_exam2_date date,
  add column if not exists term2_exam1_date date,
  add column if not exists term2_exam2_date date;

-- Leftovers of the first (colliding) version of the old 0086: duplicates of
-- the 0009 columns above. Harmless no-op everywhere else.
alter table public.profiles
  drop column if exists takes_private_lessons,
  drop column if exists attends_prep_course,
  drop column if exists had_prior_coaching;

-- === 3. exam_type is an admin-only system field ==============================
-- A coach may ORIGINATE the value (signup_requests.exam_type, copied on
-- account creation) but not silently change it afterwards. The service_role
-- exemption is required: approveSignupRequest sets exam_type from the
-- service-role client, where is_admin() resolves false.

create or replace function public.prevent_student_system_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin()
    and auth.role() <> 'service_role'
    and current_setting('app.bypass_tampering_guard', true) is distinct from 'true'
  then
    if new.coaching_start_date is distinct from old.coaching_start_date
      or new.assigned_meeting_day is distinct from old.assigned_meeting_day
      or new.remaining_sessions is distinct from old.remaining_sessions
      or new.is_active is distinct from old.is_active
      or new.exit_category is distinct from old.exit_category
      or new.exit_note is distinct from old.exit_note
      or new.exited_at is distinct from old.exited_at
      or new.total_session_quota is distinct from old.total_session_quota
      or new.admin_notes is distinct from old.admin_notes
      or new.pool_status is distinct from old.pool_status
      or new.academic_track is distinct from old.academic_track
      or new.exam_type is distinct from old.exam_type
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

-- === 4. Remove tables/types from the abandoned LGS designs ===================
-- Refuses to run if any of them holds rows, so nothing is ever deleted
-- silently. (No-op on a fresh database.)

do $$
declare
  t text;
  n bigint;
  offenders text := '';
begin
  foreach t in array array[
    'lgs_tasks',
    'lgs_general_exam_topic_mistakes',
    'lgs_branch_exam_topic_mistakes',
    'lgs_general_exams',
    'lgs_branch_exams'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        offenders := offenders || format('%s (%s rows) ', t, n);
      end if;
    end if;
  end loop;

  if offenders <> '' then
    raise exception 'Refusing to drop abandoned LGS tables that still contain data -> %', offenders;
  end if;
end $$;

drop table if exists public.lgs_tasks;
drop table if exists public.lgs_general_exam_topic_mistakes;
drop table if exists public.lgs_branch_exam_topic_mistakes;
drop table if exists public.lgs_general_exams;
drop table if exists public.lgs_branch_exams;

-- The pipeline table changed shape (subject enum -> course_id text, matching
-- student_resource_progress). If the OLD shape is present it was never wired
-- to any UI, so it's safe to replace -- unless it somehow holds rows.
do $$
declare
  n bigint;
begin
  if to_regclass('public.lgs_topic_pipeline_status') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'lgs_topic_pipeline_status'
        and column_name = 'subject'
    )
  then
    select count(*) into n from public.lgs_topic_pipeline_status;
    if n > 0 then
      raise exception 'lgs_topic_pipeline_status (old shape) holds % rows; migrate them before re-running.', n;
    end if;
    drop table public.lgs_topic_pipeline_status;
  end if;
end $$;

-- The enum only served the dropped tables. Left in place (notice, no error)
-- if some other object still depends on it.
do $$
begin
  drop type if exists public.lgs_subject;
exception
  when dependent_objects_still_exist then
    raise notice 'public.lgs_subject is still used by another object; leaving it in place.';
end $$;

-- === 5. lgs_daily_routines: Paragraf + Kitap Okuma ===========================
-- One row per (student, day). Paragraf (D/Y/B + minutes) and Kitap Okuma
-- (pages, optional title/author) are independent halves of the same row.
-- Net is never stored: LGS net = correct - wrong/3 is computed at read time.

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

create index if not exists lgs_daily_routines_student_idx
  on public.lgs_daily_routines (student_id, entry_date);

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

-- === 6. lgs_topic_pipeline_status: Konu İşleyiş Borusu =======================
-- One row per (student, course, topic) with the four pipeline checkboxes:
-- Okul İlerlemesi / Konu Tekrarı / MEB Kaynağı / Çıkmış Sorular. ("Soru
-- Çözümü" is the existing student_resource_progress matrix, reused as-is.)
-- course_id / topic_id are curriculum slugs from lib/curriculum/lgs.json
-- (plain text, no FK -- the curriculum is static content, not a table), same
-- convention as student_resource_progress.

create table if not exists public.lgs_topic_pipeline_status (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  topic_id text not null,

  okul_ilerlemesi boolean not null default false,
  konu_tekrari boolean not null default false,
  meb_kaynagi boolean not null default false,
  cikmis_sorular boolean not null default false,

  updated_at timestamptz not null default now(),

  unique (student_id, course_id, topic_id)
);

create index if not exists lgs_topic_pipeline_status_student_idx
  on public.lgs_topic_pipeline_status (student_id, course_id);

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

-- === 7. yks_topic_pipeline_status: YKS Konu İşleyiş Borusu ==================
-- Same shape and policies as the LGS table, with the YKS steps: one row per
-- (student, course, topic) holding Konu Çalışması + Çıkmış Sorular. course_id
-- is a tyt-/ayt- curriculum slug (plain text, no FK), like every other topic
-- reference in this app.

create table if not exists public.yks_topic_pipeline_status (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  topic_id text not null,

  konu_calismasi boolean not null default false,
  cikmis_sorular boolean not null default false,

  updated_at timestamptz not null default now(),

  unique (student_id, course_id, topic_id)
);

create index if not exists yks_topic_pipeline_status_student_idx
  on public.yks_topic_pipeline_status (student_id, course_id);

alter table public.yks_topic_pipeline_status enable row level security;
grant select, insert, update, delete on public.yks_topic_pipeline_status to authenticated;

drop policy if exists "yks_topic_pipeline_status_admin_all" on public.yks_topic_pipeline_status;
create policy "yks_topic_pipeline_status_admin_all" on public.yks_topic_pipeline_status for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "yks_topic_pipeline_status_student_own" on public.yks_topic_pipeline_status;
create policy "yks_topic_pipeline_status_student_own" on public.yks_topic_pipeline_status for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

drop policy if exists "yks_topic_pipeline_status_coach_all" on public.yks_topic_pipeline_status;
create policy "yks_topic_pipeline_status_coach_all" on public.yks_topic_pipeline_status for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = yks_topic_pipeline_status.student_id))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = yks_topic_pipeline_status.student_id));

drop policy if exists "yks_topic_pipeline_status_parent_read" on public.yks_topic_pipeline_status;
create policy "yks_topic_pipeline_status_parent_read" on public.yks_topic_pipeline_status for select to authenticated
  using (exists (select 1 from public.parent_students ps where ps.parent_id = (select auth.uid()) and ps.student_id = yks_topic_pipeline_status.student_id));

-- === 8. Done =================================================================

notify pgrst, 'reload schema';

-- Verification: expect 3 rows (lgs_daily_routines, lgs_topic_pipeline_status,
-- yks_topic_pipeline_status), each with rls_enabled = true and policy_count = 4.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('lgs_daily_routines', 'lgs_topic_pipeline_status', 'yks_topic_pipeline_status')
order by c.relname;
