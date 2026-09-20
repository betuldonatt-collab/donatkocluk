-- LGS Phase 3 (part 2): the Task Board / Kanban table.
--
-- Design notes:
--   - A new table, not an extension of student_tasks -- same reasoning as
--     0085 (student_tasks' rollup/karne/analytics pipeline is deeply
--     YKS-shaped; this keeps that pipeline completely untouched, zero
--     regression risk). "Same methodology" was read as UI/UX parity
--     (Kanban board, task modal, D/Y/B entry), not "same table."
--   - Reuses the EXISTING public.task_status and public.task_type enums
--     rather than declaring new ones -- both are already generic concept
--     names (pending/done/half_done/not_done,
--     question_bank/topic_study/branch_exam/general_exam/extra_custom),
--     not YKS-specific values. Sharing the enum TYPE is safe; it's
--     sharing the TABLE that would create cross-cohort coupling, and this
--     doesn't.
--   - general_exam_id / branch_exam_id: a Genel Deneme or Branş Deneme
--     task is a thin scheduling wrapper around a real row in
--     lgs_general_exams / lgs_branch_exams (0085) -- assigning one creates
--     the linked exam row eagerly (all-zero counts), so the strict
--     per-subject question caps from 0085 still apply to LGS exam data
--     regardless of whether it arrived via the task board. No DB-level
--     CHECK ties task_type to which FK is set (student_tasks itself has
--     no such type-consistency constraint for its own polymorphic
--     columns) -- that invariant is maintained by the app layer
--     (createLgsTask), matching this app's established convention for
--     this shape of table.
--   - topic_id is plain text, no FK -- same convention as every other
--     topic reference in this app.
--   - Idempotent throughout, matching 0085/0086/0087.

create table if not exists public.lgs_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  task_date date not null,
  order_index int not null default 0,

  task_type public.task_type not null,
  title text not null,
  subject public.lgs_subject,
  topic_id text,

  -- Direct D/Y/B/duration entry for question_bank/topic_study/extra_custom
  -- -- same generic-column reuse convention as student_tasks itself.
  total_count smallint check (total_count is null or total_count >= 0),
  correct_count smallint check (correct_count is null or correct_count >= 0),
  wrong_count smallint check (wrong_count is null or wrong_count >= 0),
  empty_count smallint check (empty_count is null or empty_count >= 0),
  duration_minutes smallint check (duration_minutes is null or duration_minutes >= 0),

  -- Only one of these is ever set, matching task_type = 'general_exam' /
  -- 'branch_exam' respectively -- maintained by application code.
  general_exam_id uuid references public.lgs_general_exams (id) on delete set null,
  branch_exam_id uuid references public.lgs_branch_exams (id) on delete set null,

  status public.task_status not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lgs_tasks_student_idx on public.lgs_tasks (student_id, task_date, order_index);

alter table public.lgs_tasks enable row level security;
grant select, insert, update, delete on public.lgs_tasks to authenticated;

drop policy if exists "lgs_tasks_admin_all" on public.lgs_tasks;
create policy "lgs_tasks_admin_all" on public.lgs_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lgs_tasks_student_own" on public.lgs_tasks;
create policy "lgs_tasks_student_own" on public.lgs_tasks for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

drop policy if exists "lgs_tasks_coach_all" on public.lgs_tasks;
create policy "lgs_tasks_coach_all" on public.lgs_tasks for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_tasks.student_id))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = lgs_tasks.student_id));

drop policy if exists "lgs_tasks_parent_read" on public.lgs_tasks;
create policy "lgs_tasks_parent_read" on public.lgs_tasks for select to authenticated
  using (exists (select 1 from public.parent_students ps where ps.parent_id = (select auth.uid()) and ps.student_id = lgs_tasks.student_id));

notify pgrst, 'reload schema';
