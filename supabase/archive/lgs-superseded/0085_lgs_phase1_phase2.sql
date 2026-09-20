-- LGS (8th grade) cohort support -- Phase 1 (profile & cohort isolation)
-- and Phase 2 (LGS-specific exam schema).
--
-- Idempotent throughout -- CREATE TYPE has no IF NOT EXISTS in Postgres,
-- so both enum creations are wrapped in an existence check; everything
-- else uses IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE. Safe to
-- re-run after a partial failure without erroring on whatever already
-- landed.
--
-- Design notes (see chat for the full Excel-grounded analysis):
--   - exam_type is a new, dedicated, NOT NULL column defaulting to 'YKS' --
--     every existing student keeps today's behavior with zero migration
--     risk. It is NOT derived from the existing academic_track column
--     (coach_specialization enum, which already has a 'lgs_ortaokul'
--     value from an earlier phase) -- academic_track is nullable and more
--     granular (it also splits YKS into sayisal/ea/sozel/ydt), so it's
--     the wrong thing to gate a hard "never see YKS features" isolation
--     rule on. The two fields are related (an LGS student should also get
--     academic_track = 'lgs_ortaokul') but are set independently; nothing
--     here enforces that pairing automatically.
--   - exam_type joins the existing admin-only "system fields" guard
--     (prevent_student_system_field_tampering, last extended in 0029) --
--     same protection level as academic_track/pool_status/total_session_quota.
--     A coach can still be the one who ORIGINATES the value (see
--     signup_requests.exam_type below, copied in on account creation,
--     which is an INSERT the trigger never runs against), just not
--     silently change it afterward via profiles_coach_update.
--   - lgs_general_exams and lgs_branch_exams are new, LGS-only tables,
--     not an extension of student_tasks. student_tasks is deeply
--     YKS-shaped (course_id/topic_id assume the tyt-/ayt- curriculum,
--     karne generation, question-distribution rollups, etc. all branch on
--     it) -- retrofitting it risks regressing every existing YKS student,
--     which the standing rule for this app explicitly forbids. This also
--     matches the app's own established convention of duplicating
--     per-cohort rather than sharing one generic abstraction (see the
--     existing student/coach/parent per-panel component duplication).
--   - Net is NOT stored. Same convention as the rest of this app (Toplam
--     is derived from D/Y/B, never trusted as input) -- lgs_net will be a
--     plain TypeScript helper (lib/scoring.ts) applying Net = Doğru -
--     Yanlış/3, computed at read time, not a generated column here.
--   - lgs_branch_exams strict-limits: unlike lgs_general_exams (a fixed
--     90-question real-exam format), a branş deneme's total question
--     count varies per publisher/resource, so there's no fixed per-subject
--     cap to check-constrain here -- only correct/wrong/empty >= 0.

-- === Phase 1: cohort flag ===================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_type') then
    create type public.exam_type as enum ('YKS', 'LGS');
  end if;
end $$;

alter table public.profiles
  add column if not exists exam_type public.exam_type not null default 'YKS';

-- Phase 2's "Hedef Lise" / "Hedef Yüzdelik Dilim", parallel to the existing
-- target_university/target_department/target_ranking (0009) -- same
-- coach-editable reach (NOT added to the tampering guard below), since
-- these are ordinary academic-profile fields, not system fields.
alter table public.profiles
  add column if not exists target_high_school text,
  add column if not exists target_percentile numeric(5, 2);

-- Carries the coach's chosen cohort from the public signup form through to
-- account approval (approveSignupRequest, app/admin/actions.ts). Nullable:
-- parent/coach signups never set it.
alter table public.signup_requests
  add column if not exists exam_type public.exam_type;

-- approveSignupRequest copies exam_type onto the new profile in the SAME
-- follow-up UPDATE that already (0071) corrects `role`, run from the
-- service-role client. prevent_self_role_change (0001/0071) already
-- learned this exact lesson for `role` itself: is_admin() resolves false
-- for a service-role connection (auth.uid() has no `sub` claim), so
-- without this exemption that UPDATE would be blocked the first time it
-- actually needs to touch exam_type, breaking every LGS account approval.
-- Same fix, same precedent, applied here too. CREATE OR REPLACE is
-- already idempotent -- no guard needed around this block.
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

-- === Phase 2: LGS exam schema ===============================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lgs_subject') then
    create type public.lgs_subject as enum (
      'turkce',
      'matematik',
      'fen_bilimleri',
      'inkilap_tarihi',
      'din_kulturu',
      'ingilizce'
    );
  end if;
end $$;

-- One row per full 90-question LGS deneme attempt. Strict per-subject caps
-- mirror the real exam format (Sözel: Türkçe 20 + İnkılap 10 + Din Kültürü
-- 10 + İngilizce 10; Sayısal: Matematik 20 + Fen 20).
create table if not exists public.lgs_general_exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  exam_date date not null,
  publisher text,

  turkce_correct smallint not null default 0,
  turkce_wrong smallint not null default 0,
  turkce_empty smallint not null default 0,

  inkilap_correct smallint not null default 0,
  inkilap_wrong smallint not null default 0,
  inkilap_empty smallint not null default 0,

  din_kulturu_correct smallint not null default 0,
  din_kulturu_wrong smallint not null default 0,
  din_kulturu_empty smallint not null default 0,

  ingilizce_correct smallint not null default 0,
  ingilizce_wrong smallint not null default 0,
  ingilizce_empty smallint not null default 0,

  matematik_correct smallint not null default 0,
  matematik_wrong smallint not null default 0,
  matematik_empty smallint not null default 0,

  fen_correct smallint not null default 0,
  fen_wrong smallint not null default 0,
  fen_empty smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lgs_general_exams_turkce_total check (turkce_correct + turkce_wrong + turkce_empty <= 20),
  constraint lgs_general_exams_inkilap_total check (inkilap_correct + inkilap_wrong + inkilap_empty <= 10),
  constraint lgs_general_exams_din_kulturu_total check (din_kulturu_correct + din_kulturu_wrong + din_kulturu_empty <= 10),
  constraint lgs_general_exams_ingilizce_total check (ingilizce_correct + ingilizce_wrong + ingilizce_empty <= 10),
  constraint lgs_general_exams_matematik_total check (matematik_correct + matematik_wrong + matematik_empty <= 20),
  constraint lgs_general_exams_fen_total check (fen_correct + fen_wrong + fen_empty <= 20),

  constraint lgs_general_exams_turkce_nonneg check (turkce_correct >= 0 and turkce_wrong >= 0 and turkce_empty >= 0),
  constraint lgs_general_exams_inkilap_nonneg check (inkilap_correct >= 0 and inkilap_wrong >= 0 and inkilap_empty >= 0),
  constraint lgs_general_exams_din_kulturu_nonneg check (din_kulturu_correct >= 0 and din_kulturu_wrong >= 0 and din_kulturu_empty >= 0),
  constraint lgs_general_exams_ingilizce_nonneg check (ingilizce_correct >= 0 and ingilizce_wrong >= 0 and ingilizce_empty >= 0),
  constraint lgs_general_exams_matematik_nonneg check (matematik_correct >= 0 and matematik_wrong >= 0 and matematik_empty >= 0),
  constraint lgs_general_exams_fen_nonneg check (fen_correct >= 0 and fen_wrong >= 0 and fen_empty >= 0)
);

create index if not exists lgs_general_exams_student_idx on public.lgs_general_exams (student_id, exam_date);

alter table public.lgs_general_exams enable row level security;
grant select, insert, update, delete on public.lgs_general_exams to authenticated;

drop policy if exists "lgs_general_exams_admin_all" on public.lgs_general_exams;
create policy "lgs_general_exams_admin_all" on public.lgs_general_exams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_general_exams_student_own" on public.lgs_general_exams;
create policy "lgs_general_exams_student_own" on public.lgs_general_exams for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

drop policy if exists "lgs_general_exams_coach_all" on public.lgs_general_exams;
create policy "lgs_general_exams_coach_all" on public.lgs_general_exams for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_general_exams.student_id))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_general_exams.student_id));

drop policy if exists "lgs_general_exams_parent_read" on public.lgs_general_exams;
create policy "lgs_general_exams_parent_read" on public.lgs_general_exams for select to authenticated
  using (exists (select 1 from public.parent_students ps where ps.parent_id = (select auth.uid()) and ps.student_id = lgs_general_exams.student_id));

-- One row per single-subject branş deneme attempt. No strict total-question
-- cap (varies per publisher/resource) -- resource_id optionally links back
-- to the existing branch-exam stock table (student_resources, kind =
-- 'branch_exam', already built for YKS) so completing a linked attempt can
-- decrement that resource's remaining_stock the same way YKS already does
-- -- wiring that decrement is Phase 3 application code, this column just
-- reserves the relationship now.
create table if not exists public.lgs_branch_exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject public.lgs_subject not null,
  resource_id uuid references public.student_resources (id) on delete set null,
  exam_date date not null,
  publisher text,
  correct smallint not null default 0 check (correct >= 0),
  wrong smallint not null default 0 check (wrong >= 0),
  empty smallint not null default 0 check (empty >= 0),
  duration_minutes smallint check (duration_minutes is null or duration_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lgs_branch_exams_student_idx on public.lgs_branch_exams (student_id, subject, exam_date);

alter table public.lgs_branch_exams enable row level security;
grant select, insert, update, delete on public.lgs_branch_exams to authenticated;

drop policy if exists "lgs_branch_exams_admin_all" on public.lgs_branch_exams;
create policy "lgs_branch_exams_admin_all" on public.lgs_branch_exams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_branch_exams_student_own" on public.lgs_branch_exams;
create policy "lgs_branch_exams_student_own" on public.lgs_branch_exams for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

drop policy if exists "lgs_branch_exams_coach_all" on public.lgs_branch_exams;
create policy "lgs_branch_exams_coach_all" on public.lgs_branch_exams for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_branch_exams.student_id))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_branch_exams.student_id));

drop policy if exists "lgs_branch_exams_parent_read" on public.lgs_branch_exams;
create policy "lgs_branch_exams_parent_read" on public.lgs_branch_exams for select to authenticated
  using (exists (select 1 from public.parent_students ps where ps.parent_id = (select auth.uid()) and ps.student_id = lgs_branch_exams.student_id));

notify pgrst, 'reload schema';
