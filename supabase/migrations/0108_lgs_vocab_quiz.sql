-- LGS English Vocabulary Quiz, Phase 1 (schema only -- no server actions or
-- UI yet). Two tables:
--   - lgs_words: the master word list (admin-curated, shared by every
--     student -- not scoped to one cohort/student the way student_tasks
--     etc. are).
--   - student_word_progress: one row per (student, word), tracking a simple
--     spaced-repetition streak. is_mastered flips to true once
--     correct_streak reaches 3 -- that transition is application logic
--     (Phase 2's server actions), not enforced here.

create table public.lgs_words (
  id uuid primary key default gen_random_uuid(),
  unit_number int not null check (unit_number between 1 and 10),
  english_word text not null,
  turkish_meaning text not null,
  created_at timestamptz not null default now()
);

create index lgs_words_unit_idx on public.lgs_words (unit_number);

alter table public.lgs_words enable row level security;
grant select, insert, update, delete on public.lgs_words to authenticated;

-- Every authenticated user (student, coach, parent, admin) can read the
-- word list -- it's shared reference data, not per-account.
create policy "lgs_words_select_all"
  on public.lgs_words for select
  to authenticated
  using (true);

-- Only an admin curates the list itself.
create policy "lgs_words_admin_write"
  on public.lgs_words for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------

create table public.student_word_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  word_id uuid not null references public.lgs_words (id) on delete cascade,
  correct_streak int not null default 0 check (correct_streak >= 0),
  is_mastered boolean not null default false,
  last_tested_at timestamptz,
  unique (student_id, word_id)
);

create index student_word_progress_student_idx on public.student_word_progress (student_id);
create index student_word_progress_word_idx on public.student_word_progress (word_id);

alter table public.student_word_progress enable row level security;
grant select, insert, update, delete on public.student_word_progress to authenticated;

-- A student reads and writes only their own progress -- never another
-- student's, and never through insert/update by supplying a different
-- student_id (the with check on each policy blocks that same as every
-- other student-owned table in this app).
create policy "student_word_progress_student_select"
  on public.student_word_progress for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "student_word_progress_student_insert"
  on public.student_word_progress for insert
  to authenticated
  with check (student_id = (select auth.uid()));

create policy "student_word_progress_student_update"
  on public.student_word_progress for update
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- A coach can see (read-only) their own assigned students' progress --
-- same coach_students-scoped pattern used across this app (e.g.
-- coaching_sessions_coach_all, 0005_coaching_ecosystem.sql), but read-only
-- here since a coach has no reason to edit a student's own quiz streak.
create policy "student_word_progress_coach_read"
  on public.student_word_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_word_progress.student_id
    )
  );

create policy "student_word_progress_admin_all"
  on public.student_word_progress for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';

-- Verification: both tables, their RLS, and the unique constraint exist (expect true, true, true).
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('lgs_words', 'student_word_progress')) = 2
    as lgs_vocab_tables_exist,
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('lgs_words', 'student_word_progress'))
    as lgs_vocab_rls_enabled,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_word_progress'::regclass and contype = 'u'
  ) as student_word_progress_unique_constraint_exists;
