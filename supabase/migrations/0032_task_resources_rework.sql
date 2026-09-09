-- Corrects 0031: a single alternative_resource_id column was the wrong
-- shape for "assign N resources to one task" -- it only ever supports
-- exactly two. This replaces BOTH the original single resource_id column
-- and the mistaken alternative_resource_id with a proper junction table,
-- so a task can hold 0, 1, or N resources.
--
-- A plain uuid[] array on student_tasks was considered (it already has
-- exactly this shape for video_links) and rejected specifically because
-- these are foreign keys: Postgres can't enforce a REFERENCES constraint
-- on individual array elements, so a deleted student_resources row would
-- leave a dangling id behind with no cleanup. deleteStudentResource
-- (app/coach/actions.ts) is a real, reachable action -- a junction table
-- with on delete cascade keeps that path safe automatically, the same
-- guarantee the single resource_id column already had via its own FK.
create table public.task_resources (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.student_tasks (id) on delete cascade,
  resource_id uuid not null references public.student_resources (id) on delete cascade,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create unique index task_resources_unique_pair on public.task_resources (task_id, resource_id);
create index task_resources_task_idx on public.task_resources (task_id, order_index);

alter table public.task_resources enable row level security;
grant select, insert, update, delete on public.task_resources to authenticated;

create policy "task_resources_admin_all"
  on public.task_resources for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Mirrors student_tasks_coach_all's exact using/with check split (0005):
-- using = the assigned coach's link to the student via coach_students,
-- with check = the task itself already belongs to this coach.
create policy "task_resources_coach_all"
  on public.task_resources for all
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    join public.coach_students cs on cs.coach_id = (select auth.uid()) and cs.student_id = st.student_id
    where st.id = task_resources.task_id
  ))
  with check (exists (
    select 1 from public.student_tasks st
    where st.id = task_resources.task_id and st.coach_id = (select auth.uid())
  ));

create policy "task_resources_student_read"
  on public.task_resources for select
  to authenticated
  using (exists (
    select 1 from public.student_tasks st
    where st.id = task_resources.task_id and st.student_id = (select auth.uid())
  ));

-- Preserve existing single/alternative resource assignments before
-- dropping the columns they lived on.
insert into public.task_resources (task_id, resource_id, order_index)
select id, resource_id, 0 from public.student_tasks where resource_id is not null;

insert into public.task_resources (task_id, resource_id, order_index)
select id, alternative_resource_id, 1 from public.student_tasks where alternative_resource_id is not null
on conflict (task_id, resource_id) do nothing;

alter table public.student_tasks drop column resource_id;
alter table public.student_tasks drop column alternative_resource_id;
