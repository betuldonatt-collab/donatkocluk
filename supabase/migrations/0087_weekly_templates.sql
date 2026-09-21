-- =============================================================================
-- Weekly templates ("Şablon Sistemi")
--
-- A coach builds a reusable week once (e.g. "LGS Temel Hafta": 15 pages of book
-- reading every day, Okul Tekrarı on weekdays, an LGS Sözel Deneme every
-- Saturday) and applies it to a student's week with one click.
--
--   weekly_templates              one template per (coach, name)
--   weekly_template_items         its tasks: the weekdays each repeats on (0 =
--                                 Pazartesi .. 6 = Pazar) + the task itself as
--                                 jsonb -- the SAME payload the coach's
--                                 assign-task form produces, so applying a
--                                 template creates exactly the student_tasks
--                                 rows assigning each task by hand would. It is
--                                 validated by the server actions on write and
--                                 again on apply; resources are never stored
--                                 (they belong to one student's library).
--   weekly_template_applications  a log of "template X applied to student Y for
--                                 the week starting Z", used to warn before the
--                                 same template is applied to the same week
--                                 twice.
--
-- Templates are private to their coach (RLS); nothing here touches
-- student_tasks itself -- applying goes through the normal assign path.
-- Idempotent: safe to run more than once.
-- =============================================================================

-- === 1. Templates ============================================================

create table if not exists public.weekly_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Which cohort's courses the template's tasks use; a template is only offered
  -- for students of the same cohort.
  exam_type public.exam_type not null default 'LGS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists weekly_templates_coach_name_idx
  on public.weekly_templates (coach_id, lower(btrim(name)));

-- === 2. Items ================================================================

create table if not exists public.weekly_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.weekly_templates (id) on delete cascade,
  days smallint[] not null
    check (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  task jsonb not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists weekly_template_items_template_idx
  on public.weekly_template_items (template_id, order_index);

-- === 3. Application log ======================================================

create table if not exists public.weekly_template_applications (
  id uuid primary key default gen_random_uuid(),
  -- Kept (set null) if the template is later deleted: the log of what was
  -- applied to a student's week stays true.
  template_id uuid references public.weekly_templates (id) on delete set null,
  template_name text not null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  task_count int not null check (task_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists weekly_template_applications_lookup_idx
  on public.weekly_template_applications (student_id, week_start, template_id);

-- === 4. Row level security ===================================================

alter table public.weekly_templates enable row level security;
alter table public.weekly_template_items enable row level security;
alter table public.weekly_template_applications enable row level security;

grant select, insert, update, delete on public.weekly_templates to authenticated;
grant select, insert, update, delete on public.weekly_template_items to authenticated;
grant select, insert on public.weekly_template_applications to authenticated;

-- Templates: private to the coach who owns them. Creating one additionally
-- requires the caller to actually be a coach (a student could otherwise create
-- rows under their own id).
drop policy if exists "weekly_templates_owner" on public.weekly_templates;
create policy "weekly_templates_owner" on public.weekly_templates for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
  );

drop policy if exists "weekly_templates_admin_all" on public.weekly_templates;
create policy "weekly_templates_admin_all" on public.weekly_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Items follow their template's owner.
drop policy if exists "weekly_template_items_owner" on public.weekly_template_items;
create policy "weekly_template_items_owner" on public.weekly_template_items for all to authenticated
  using (exists (
    select 1 from public.weekly_templates t
    where t.id = weekly_template_items.template_id and t.coach_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.weekly_templates t
    where t.id = weekly_template_items.template_id and t.coach_id = (select auth.uid())
  ));

drop policy if exists "weekly_template_items_admin_all" on public.weekly_template_items;
create policy "weekly_template_items_admin_all" on public.weekly_template_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Applications: a coach reads their own log and may only log an application to a
-- student on their own roster.
drop policy if exists "weekly_template_applications_read" on public.weekly_template_applications;
create policy "weekly_template_applications_read" on public.weekly_template_applications for select to authenticated
  using (coach_id = (select auth.uid()));

drop policy if exists "weekly_template_applications_insert" on public.weekly_template_applications;
create policy "weekly_template_applications_insert" on public.weekly_template_applications for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = weekly_template_applications.student_id
    )
  );

drop policy if exists "weekly_template_applications_admin_all" on public.weekly_template_applications;
create policy "weekly_template_applications_admin_all" on public.weekly_template_applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

-- Verification: expect 3 rows, each rls_enabled = true; policy_count = 3 for
-- weekly_template_applications, 2 for weekly_template_items, 2 for weekly_templates.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('weekly_templates', 'weekly_template_items', 'weekly_template_applications')
order by c.relname;
