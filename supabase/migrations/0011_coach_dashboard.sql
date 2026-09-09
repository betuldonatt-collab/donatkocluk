-- Phase 6: Coach Dashboard -- post-meeting CRM evaluation on
-- coaching_sessions, the coach's personal calendar blocks, and the
-- coach's daily task checklist (manual / admin-assigned / automation).
--
-- Design notes:
--   - coach_task_status is a NEW enum distinct from student_tasks'
--     task_status, even though both have a "pending" value -- coach tasks
--     have a 4th state (message_sent) student tasks don't, and keeping
--     them separate means this migration never touches a type the
--     student side depends on.
--   - Rollover ("Yapılmadı"/"Mesaj Atıldı" -> duplicated onto the next
--     day) and the recurring "every 4th completed meeting -> Veli
--     Görüşmesi" automation are implemented as server-action logic, not
--     triggers -- rolled_over_from is here purely so that chain is
--     traceable and a task is never rolled over twice.
--   - coach_calendar_blocks is a new table, not new coaching_sessions
--     rows with a null student_id, because a personal block has no
--     student, no meeting_url, and shouldn't ever show up anywhere a
--     student-facing query might read coaching_sessions.

-- ---------------------------------------------------------------------
-- 1. Post-meeting evaluation on coaching_sessions
create type public.session_outcome as enum ('pending', 'completed', 'not_happened');
create type public.session_missed_reason as enum ('student_no_show', 'coach_no_show', 'other');

alter table public.coaching_sessions
  add column outcome public.session_outcome not null default 'pending',
  add column evaluation_notes text,
  add column missed_reason public.session_missed_reason,
  add column missed_reason_note text,
  add column evaluated_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Coach's personal calendar blocks ("Farklı bir iş")
create table public.coach_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index coach_calendar_blocks_coach_idx on public.coach_calendar_blocks (coach_id, start_at);

alter table public.coach_calendar_blocks enable row level security;
grant select, insert, update, delete on public.coach_calendar_blocks to authenticated;

create policy "coach_calendar_blocks_admin_read"
  on public.coach_calendar_blocks for select
  to authenticated
  using (public.is_admin());

create policy "coach_calendar_blocks_coach_all"
  on public.coach_calendar_blocks for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Coach's daily task checklist
create type public.coach_task_status as enum ('pending', 'done', 'not_done', 'message_sent');
create type public.coach_task_source as enum ('manual', 'admin_assigned', 'automation');

create table public.coach_tasks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete set null,
  task_date date not null,
  title text not null,
  description text,
  source public.coach_task_source not null default 'manual',
  status public.coach_task_status not null default 'pending',
  order_index int not null default 0,
  rolled_over_from uuid references public.coach_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_tasks_coach_date_idx on public.coach_tasks (coach_id, task_date);
create index coach_tasks_rolled_over_from_idx on public.coach_tasks (rolled_over_from);

alter table public.coach_tasks enable row level security;
grant select, insert, update, delete on public.coach_tasks to authenticated;

create policy "coach_tasks_admin_all"
  on public.coach_tasks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coach_tasks_coach_all"
  on public.coach_tasks for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));
