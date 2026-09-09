-- Student-led daily stats: one row per (student, day), student-writable
-- via upsert, coach-optional-override via the same coach_students-scoped
-- pattern already used for coach_notes/coaching_sessions. updated_by is
-- stamped by a trigger from auth.uid() -- never trusted from the client
-- payload -- so "Son düzenleyen" is always accurate regardless of what a
-- caller sends.
create table public.student_daily_stats (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  total_count int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index student_daily_stats_unique_day on public.student_daily_stats (student_id, entry_date);

alter table public.student_daily_stats enable row level security;
grant select, insert, update, delete on public.student_daily_stats to authenticated;

create policy "student_daily_stats_admin_all"
  on public.student_daily_stats for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "student_daily_stats_own"
  on public.student_daily_stats for all
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

create policy "student_daily_stats_coach_override"
  on public.student_daily_stats for all
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_daily_stats.student_id
  ))
  with check (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_daily_stats.student_id
  ));

create function public.stamp_daily_stats_updated_by()
returns trigger
language plpgsql
as $$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

create trigger student_daily_stats_stamp
  before insert or update on public.student_daily_stats
  for each row execute function public.stamp_daily_stats_updated_by();

-- Alternative resource on an assigned task ("solve from Book A, or if
-- unavailable, Book B"). Nullable, additive -- existing rows/queries are
-- unaffected. A single extra column, not a join table -- escalate to one
-- only if a third resource option is ever actually requested.
alter table public.student_tasks
  add column alternative_resource_id uuid references public.student_resources (id) on delete set null;
