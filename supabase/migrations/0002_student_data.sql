-- Persists the three student-panel modules that previously lived only in
-- React state: Ödevler (homework), Kaynak Takibi (resource progress), and
-- Paragraf/Problem Takibi. Every table is owned-row-only via RLS — a
-- student can only ever see/write their own data. No coach/parent/admin
-- read access yet; that comes with the relation tables those panels need
-- (deferred, see the v1.1 plan).

-- ---------------------------------------------------------------------
-- Ödevler: task *definitions* (DAILY_TASKS/WEEKLY_TASKS) stay hardcoded
-- in the app for this pass — only a student's completion state persists.
create type public.task_scope as enum ('daily', 'weekly');
create type public.task_status as enum ('pending', 'done', 'not_done');

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  scope public.task_scope not null,
  task_id text not null,
  status public.task_status not null default 'pending',
  reason text,
  note text,
  updated_at timestamptz not null default now(),
  unique (student_id, scope, task_id)
);

alter table public.task_completions enable row level security;
grant select, insert, update on public.task_completions to authenticated;

create policy "task_completions_own"
  on public.task_completions for all
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Kaynak Takibi: resources a student adds per course, and the
-- solved/reviewed checkbox grid per topic × resource.
create table public.student_resources (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.student_resources enable row level security;
grant select, insert, update, delete on public.student_resources to authenticated;

create policy "student_resources_own"
  on public.student_resources for all
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

create table public.student_resource_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  topic_id text not null,
  resource_id uuid not null references public.student_resources (id) on delete cascade,
  solved boolean not null default false,
  reviewed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (student_id, topic_id, resource_id)
);

alter table public.student_resource_progress enable row level security;
grant select, insert, update on public.student_resource_progress to authenticated;

create policy "student_resource_progress_own"
  on public.student_resource_progress for all
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Paragraf/Problem Takibi: one row per date. Net is intentionally NOT
-- stored — it's derived from doğru/yanlış by lib/scoring.ts on both write
-- and read, so it can never drift from its inputs.
create table public.paragraf_problem_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  paragraf_dogru int not null default 0,
  paragraf_yanlis int not null default 0,
  paragraf_bos int not null default 0,
  paragraf_sure int not null default 0,
  problem_dogru int not null default 0,
  problem_yanlis int not null default 0,
  problem_bos int not null default 0,
  problem_sure int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.paragraf_problem_entries enable row level security;
grant select, insert on public.paragraf_problem_entries to authenticated;

create policy "paragraf_problem_entries_own"
  on public.paragraf_problem_entries for all
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
