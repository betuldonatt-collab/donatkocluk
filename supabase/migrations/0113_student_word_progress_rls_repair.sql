-- Diagnostic finding: student_word_progress (0108) is completely empty in
-- production despite students answering vocab quiz questions -- the upsert
-- in submitVocabAnswer (app/student/ingilizce-quiz/actions.ts) never
-- actually lands a row. The table's own grants/RLS policies read correctly
-- in the 0108 migration file itself; this migration re-asserts all of it
-- defensively (DROP + CREATE, idempotent) and reloads PostgREST's schema
-- cache, covering the most likely real-world causes of exactly this
-- symptom -- a grant or policy that silently failed to apply when 0108 was
-- run (this project has already hit a PostgREST-schema-cache-staleness
-- issue once before, after a raw-SQL-editor migration), or a stale schema
-- cache that never picked up the table's grants at all.
-- Idempotent: safe to run more than once, and harmless if everything here
-- already matched 0108 exactly.

-- === 1. Re-assert the base grants ============================================
-- A table can have RLS policies that look correct and still reject every
-- write if the baseline GRANT itself didn't take -- RLS policies REFINE a
-- grant, they don't substitute for one.
grant select, insert, update, delete on public.student_word_progress to authenticated;

-- === 2. Re-create every policy exactly as 0108 defined it ===================

drop policy if exists "student_word_progress_student_select" on public.student_word_progress;
create policy "student_word_progress_student_select"
  on public.student_word_progress for select
  to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "student_word_progress_student_insert" on public.student_word_progress;
create policy "student_word_progress_student_insert"
  on public.student_word_progress for insert
  to authenticated
  with check (student_id = (select auth.uid()));

drop policy if exists "student_word_progress_student_update" on public.student_word_progress;
create policy "student_word_progress_student_update"
  on public.student_word_progress for update
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

drop policy if exists "student_word_progress_coach_read" on public.student_word_progress;
create policy "student_word_progress_coach_read"
  on public.student_word_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_word_progress.student_id
    )
  );

drop policy if exists "student_word_progress_admin_all" on public.student_word_progress;
create policy "student_word_progress_admin_all"
  on public.student_word_progress for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- === 3. Confirm the unique constraint onConflict relies on still exists =====
-- (student_id, word_id) -- if this is somehow missing, the app's own
-- .upsert({...}, { onConflict: "student_id,word_id" }) call fails outright
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" -- re-added defensively, matching 0111's own guarded style.
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.table_schema = 'public'
      and tc.table_name = 'student_word_progress'
      and tc.constraint_type = 'UNIQUE'
      and (
        select array_agg(kcu.column_name::text order by kcu.column_name)
        from information_schema.key_column_usage kcu
        where kcu.constraint_name = tc.constraint_name and kcu.table_schema = 'public'
      ) = array['student_id', 'word_id']::text[]
  ) then
    alter table public.student_word_progress
      add constraint student_word_progress_student_word_unique unique (student_id, word_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verification: expect 5 (one per policy above), true, true.
select count(*) as policy_count
from pg_policies
where schemaname = 'public' and tablename = 'student_word_progress';

select has_table_privilege('authenticated', 'public.student_word_progress', 'INSERT')
  as authenticated_can_insert;

select exists (
  select 1 from pg_constraint
  where conrelid = 'public.student_word_progress'::regclass and contype = 'u'
) as unique_constraint_exists;
