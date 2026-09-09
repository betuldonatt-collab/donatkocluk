-- Phase 4 UX refinement: subject-by-subject general exam scoring, and a
-- real topic-level mistake analysis step for branch/general exams
-- (previously "Analizi Sonra Yap" was just a bare checkbox with nothing
-- behind it).
--
-- Design notes:
--   - subject_scores (jsonb) holds the per-subject Doğru/Yanlış/Boş
--     breakdown for general_exam tasks (Türkçe/Sosyal/Matematik/Fen).
--     A JSONB blob is used here -- unlike the rest of student_tasks,
--     which deliberately avoids JSONB in favor of dedicated columns --
--     because the shape is genuinely per-task-type variable (4 named
--     subject groups, each with 3 numbers) and not a value ever
--     filtered/aggregated on in SQL; total_count/correct_count/etc. stay
--     unused (null) for general_exam rows.
--   - student_task_topic_mistakes is a separate table, not more columns
--     on student_tasks, because it's a variable-length set (however many
--     topics the student got wrong), not a fixed field.
--   - Ownership/RLS mirrors student_tasks exactly (join through
--     task_id -> student_tasks.student_id / coach_students), and is
--     intentionally NOT covered by prevent_student_task_core_tampering:
--     like correct_count/wrong_count/analysis_pending, topic mistakes are
--     the student's own progress/analysis data, editable regardless of
--     is_coach_assigned.

alter table public.student_tasks
  add column subject_scores jsonb;

create table public.student_task_topic_mistakes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.student_tasks (id) on delete cascade,
  course_id text not null,
  topic_id text not null,
  created_at timestamptz not null default now(),
  unique (task_id, course_id, topic_id)
);

create index student_task_topic_mistakes_task_idx on public.student_task_topic_mistakes (task_id);

alter table public.student_task_topic_mistakes enable row level security;
grant select, insert, update, delete on public.student_task_topic_mistakes to authenticated;

create policy "student_task_topic_mistakes_admin_all"
  on public.student_task_topic_mistakes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "student_task_topic_mistakes_coach_all"
  on public.student_task_topic_mistakes for all
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = st.student_id
    where st.id = student_task_topic_mistakes.task_id
  ))
  with check (exists (
    select 1 from public.student_tasks st
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = st.student_id
    where st.id = student_task_topic_mistakes.task_id
  ));

create policy "student_task_topic_mistakes_student_all"
  on public.student_task_topic_mistakes for all
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    where st.id = student_task_topic_mistakes.task_id and st.student_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.student_tasks st
    where st.id = student_task_topic_mistakes.task_id and st.student_id = (select auth.uid())
  ));
