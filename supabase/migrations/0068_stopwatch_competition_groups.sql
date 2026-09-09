-- Coach-defined competition groups + active/passive status, layered onto
-- the Stopwatch Competition (0054_stopwatch_competition.sql). A group is
-- a coach's own private label (e.g. "Mezunlar", "12. Sınıflar") for
-- splitting their roster into separate leaderboards -- visible ONLY to
-- that coach (student_groups has no student-read RLS policy at all).
-- "Passive" lets a coach exclude a misbehaving/abusive student from the
-- ranking entirely while the student keeps logging time normally and the
-- coach keeps seeing their real minutes everywhere else in the app --
-- only get_daily_stopwatch_ranking()'s ranked pool (below) excludes them.
create table public.student_groups (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (coach_id, name)
);

alter table public.student_groups enable row level security;
grant select, insert, update, delete on public.student_groups to authenticated;

-- Coach-owned-only shape (coach_id directly on the row, no student_id) --
-- same RLS shape as coach_calendar_blocks (0011_coach_dashboard.sql).
create policy "student_groups_admin_read" on public.student_groups for select
  to authenticated using (public.is_admin());

create policy "student_groups_coach_all" on public.student_groups for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create type public.student_competition_status as enum ('active', 'passive');

alter table public.profiles add column competition_group_id uuid references public.student_groups (id) on delete set null;
alter table public.profiles add column competition_status public.student_competition_status not null default 'active';

create index profiles_competition_group_idx on public.profiles (competition_group_id);

-- A student must never be able to flip their own competition status back
-- to 'active' or reassign their own group -- the entire point is letting
-- a coach exclude a misbehaving student from the leaderboard, so it can't
-- be self-service. But a coach editing that SAME row via
-- profiles_coach_update must still be able to. Deliberately a separate,
-- narrower guard from prevent_student_system_field_tampering
-- (0021/0028), whose fields are admin-only even for the coach -- these
-- two are coach-writable by design, only the STUDENT is blocked.
-- Distinguishes "am I updating my own row" (blocked unless admin) from "a
-- coach is updating a roster student's row" (allowed) by comparing
-- auth.uid() to the row's own id, rather than reusing that trigger's
-- admin-only check.
create function public.prevent_student_competition_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select auth.uid()) = old.id and not public.is_admin() then
    if new.competition_group_id is distinct from old.competition_group_id
      or new.competition_status is distinct from old.competition_status
    then
      raise exception 'Only a coach or admin can change a student''s competition group or status.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_student_competition_tampering
  before update on public.profiles
  for each row execute function public.prevent_student_competition_field_tampering();

-- Supersedes 0054's get_daily_stopwatch_ranking(): the ranked pool
-- (totals/ranked below) is now scoped to the caller's own coach AND their
-- own competition_group_id (null-safe -- students with no group at all
-- share one common "ungrouped" pool via `is not distinct from`, so
-- existing students aren't silently excluded the moment this migration
-- runs) AND competition_status = 'active'. A passive caller still gets
-- their own real my_total_minutes (computed separately, from
-- student_tasks directly, never filtered by status) but my_rank is null
-- (they're simply absent from `ranked`) -- top_student_*/participant_count
-- reflect only the active pool, same as any other caller in that group.
create or replace function public.get_daily_stopwatch_ranking()
returns table (
  my_rank int,
  my_total_minutes int,
  top_student_name text,
  top_student_total_minutes int,
  participant_count int
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select p.competition_group_id
    from public.profiles p
    where p.id = auth.uid()
  ),
  totals as (
    select
      cs.student_id,
      p.full_name,
      coalesce(sum(st.duration_minutes), 0)::int as total_minutes
    from public.coach_students cs
    join public.profiles p on p.id = cs.student_id
    left join public.student_tasks st
      on st.student_id = cs.student_id and st.task_date = (now() at time zone 'utc')::date
    where cs.coach_id = (select coach_id from public.coach_students where student_id = auth.uid())
      and p.competition_status = 'active'
      and p.competition_group_id is not distinct from (select competition_group_id from me)
    group by cs.student_id, p.full_name
  ),
  ranked as (
    select student_id, full_name, total_minutes, rank() over (order by total_minutes desc) as rnk
    from totals
  ),
  my_total as (
    select coalesce(sum(st.duration_minutes), 0)::int as total_minutes
    from public.student_tasks st
    where st.student_id = auth.uid() and st.task_date = (now() at time zone 'utc')::date
  )
  select
    (select rnk from ranked where student_id = auth.uid()),
    (select total_minutes from my_total),
    (select full_name from ranked order by rnk asc limit 1),
    (select total_minutes from ranked order by rnk asc limit 1),
    (select count(*)::int from ranked);
$$;

grant execute on function public.get_daily_stopwatch_ranking() to authenticated;

notify pgrst, 'reload schema';
