-- Supplementary LGS migration: goal fields, intake fields, school-exam
-- dates, and topic-mistake tracking for the two exam tables from 0085.
--
-- Idempotent throughout (IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE)
-- so a partial prior run -- some columns/tables/policies already landed,
-- others didn't -- can simply be re-run to reach the same end state,
-- instead of erroring on the first thing that already exists.
--
-- Design notes:
--   - No new curriculum table. Per the 3-level-depth decision (Ünite ->
--     Konu -> Alt Konu), the LGS curriculum content itself will live as a
--     static lib/curriculum/lgs.json, exactly like tyt.json/ayt-*.json
--     today -- that content is code, not user data, and ships with the
--     app the same way. What DOES need schema is a place for a real
--     student's exam result to reference one of those Alt Konu leaves --
--     that's lgs_general_exam_topic_mistakes / lgs_branch_exam_topic_mistakes
--     below, shaped identically to the existing
--     student_task_topic_mistakes (0006): topic_id text, no FK to the
--     curriculum (which isn't a table to FK against), validated at the
--     app layer against lib/curriculum/lgs.json.
--   - All the new profiles columns below (goals, intake fields, exam
--     dates) are left OUT of prevent_student_system_field_tampering on
--     purpose -- same reach as the existing target_university/
--     target_department/target_ranking (0009), which a student can
--     already self-edit via profiles_update_own. A student setting their
--     own "Hedef Lise" is the same intended UX as setting their own
--     target university; these aren't integrity-sensitive system fields.
--   - Intake fields (private lessons, prep course, daily study hours,
--     etc.) are generic questions, not LGS-specific content, so they're
--     plain profiles columns available to every student regardless of
--     exam_type -- nothing stops a coach asking a YKS student the same
--     questions. Gating what's SHOWN per cohort is a Phase 3 UI concern.
--   - CORRECTION from the first version of this migration: most of these
--     "intake fields" already existed. 0009_profile_fields.sql already
--     added has_private_tutor / attends_dershane / had_previous_coaching /
--     favorite_subjects / difficult_subjects for YKS -- these are the
--     exact same questions, so this migration reuses those columns
--     instead of adding takes_private_lessons / attends_prep_course /
--     had_prior_coaching as parallel duplicates (which the first version
--     of this file did, and which is what actually caused the
--     "favorite_subjects already exists" error -- it wasn't a partial
--     re-run of THIS migration, it was colliding with 0009). Only
--     avg_daily_study_hours is genuinely new here.
--   - İnkılap Tarihi branch exams: no schema change needed.
--     lgs_branch_exams.subject already uses the full 6-value lgs_subject
--     enum from 0085 (the Excel template's 5-subject branş-sonuçları
--     sheet was a template gap, not a schema gap).
--   - SÖZEL/SAYISAL subject grouping is a static code-level mapping
--     (mirrors TYT_SUBJECT_GROUPS, lib/curriculum/subject-groups.ts), not
--     stored data -- nothing to migrate for it.

-- === Cleanup: drop the duplicate columns if the first version of this
-- === migration already created them (harmless no-op otherwise) ============

alter table public.profiles
  drop column if exists takes_private_lessons,
  drop column if exists attends_prep_course,
  drop column if exists had_prior_coaching;

-- === Goal fields =============================================================

alter table public.profiles
  add column if not exists target_score numeric(6, 2),
  add column if not exists report_card_average numeric(5, 2),
  add column if not exists target_report_card_average numeric(5, 2);

-- === Intake fields ===========================================================
-- has_private_tutor / attends_dershane / had_previous_coaching /
-- favorite_subjects / difficult_subjects already exist (0009) -- reused
-- as-is, not duplicated. Only avg_daily_study_hours is new.

alter table public.profiles
  add column if not exists avg_daily_study_hours numeric(4, 1);

-- === School written-exam dates ("Yazılı Tarihleri") ==========================
-- One shared date per Dönem x Yazılı slot (not per subject) -- the Excel's
-- own countdown table has exactly these 4 slots, each a single date that
-- applies across every subject's written exam that day.

alter table public.profiles
  add column if not exists term1_exam1_date date,
  add column if not exists term1_exam2_date date,
  add column if not exists term2_exam1_date date,
  add column if not exists term2_exam2_date date;

-- === Topic-mistake tracking for the 0085 exam tables =========================

create table if not exists public.lgs_general_exam_topic_mistakes (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.lgs_general_exams (id) on delete cascade,
  subject public.lgs_subject not null,
  topic_id text not null,
  created_at timestamptz not null default now(),
  unique (exam_id, subject, topic_id)
);

create index if not exists lgs_general_exam_topic_mistakes_exam_idx on public.lgs_general_exam_topic_mistakes (exam_id);

alter table public.lgs_general_exam_topic_mistakes enable row level security;
grant select, insert, update, delete on public.lgs_general_exam_topic_mistakes to authenticated;

drop policy if exists "lgs_general_exam_topic_mistakes_admin_all" on public.lgs_general_exam_topic_mistakes;
create policy "lgs_general_exam_topic_mistakes_admin_all" on public.lgs_general_exam_topic_mistakes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_general_exam_topic_mistakes_student_all" on public.lgs_general_exam_topic_mistakes;
create policy "lgs_general_exam_topic_mistakes_student_all" on public.lgs_general_exam_topic_mistakes for all to authenticated
  using (exists (select 1 from public.lgs_general_exams e where e.id = lgs_general_exam_topic_mistakes.exam_id and e.student_id = (select auth.uid())))
  with check (exists (select 1 from public.lgs_general_exams e where e.id = lgs_general_exam_topic_mistakes.exam_id and e.student_id = (select auth.uid())));

drop policy if exists "lgs_general_exam_topic_mistakes_coach_all" on public.lgs_general_exam_topic_mistakes;
create policy "lgs_general_exam_topic_mistakes_coach_all" on public.lgs_general_exam_topic_mistakes for all to authenticated
  using (exists (
    select 1 from public.lgs_general_exams e
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = e.student_id
    where e.id = lgs_general_exam_topic_mistakes.exam_id
  ))
  with check (exists (
    select 1 from public.lgs_general_exams e
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = e.student_id
    where e.id = lgs_general_exam_topic_mistakes.exam_id
  ));

drop policy if exists "lgs_general_exam_topic_mistakes_parent_read" on public.lgs_general_exam_topic_mistakes;
create policy "lgs_general_exam_topic_mistakes_parent_read" on public.lgs_general_exam_topic_mistakes for select to authenticated
  using (exists (
    select 1 from public.lgs_general_exams e
    join public.parent_students ps on ps.parent_id = (select auth.uid()) and ps.student_id = e.student_id
    where e.id = lgs_general_exam_topic_mistakes.exam_id
  ));

create table if not exists public.lgs_branch_exam_topic_mistakes (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.lgs_branch_exams (id) on delete cascade,
  topic_id text not null,
  created_at timestamptz not null default now(),
  unique (exam_id, topic_id)
);

create index if not exists lgs_branch_exam_topic_mistakes_exam_idx on public.lgs_branch_exam_topic_mistakes (exam_id);

alter table public.lgs_branch_exam_topic_mistakes enable row level security;
grant select, insert, update, delete on public.lgs_branch_exam_topic_mistakes to authenticated;

drop policy if exists "lgs_branch_exam_topic_mistakes_admin_all" on public.lgs_branch_exam_topic_mistakes;
create policy "lgs_branch_exam_topic_mistakes_admin_all" on public.lgs_branch_exam_topic_mistakes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_branch_exam_topic_mistakes_student_all" on public.lgs_branch_exam_topic_mistakes;
create policy "lgs_branch_exam_topic_mistakes_student_all" on public.lgs_branch_exam_topic_mistakes for all to authenticated
  using (exists (select 1 from public.lgs_branch_exams e where e.id = lgs_branch_exam_topic_mistakes.exam_id and e.student_id = (select auth.uid())))
  with check (exists (select 1 from public.lgs_branch_exams e where e.id = lgs_branch_exam_topic_mistakes.exam_id and e.student_id = (select auth.uid())));

drop policy if exists "lgs_branch_exam_topic_mistakes_coach_all" on public.lgs_branch_exam_topic_mistakes;
create policy "lgs_branch_exam_topic_mistakes_coach_all" on public.lgs_branch_exam_topic_mistakes for all to authenticated
  using (exists (
    select 1 from public.lgs_branch_exams e
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = e.student_id
    where e.id = lgs_branch_exam_topic_mistakes.exam_id
  ))
  with check (exists (
    select 1 from public.lgs_branch_exams e
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = e.student_id
    where e.id = lgs_branch_exam_topic_mistakes.exam_id
  ));

drop policy if exists "lgs_branch_exam_topic_mistakes_parent_read" on public.lgs_branch_exam_topic_mistakes;
create policy "lgs_branch_exam_topic_mistakes_parent_read" on public.lgs_branch_exam_topic_mistakes for select to authenticated
  using (exists (
    select 1 from public.lgs_branch_exams e
    join public.parent_students ps on ps.parent_id = (select auth.uid()) and ps.student_id = e.student_id
    where e.id = lgs_branch_exam_topic_mistakes.exam_id
  ));

notify pgrst, 'reload schema';
