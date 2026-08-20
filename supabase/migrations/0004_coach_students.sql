-- Coach <-> student relationship. A student has at most one coach at a
-- time (unique on student_id); a coach can have many students. This is the
-- foundation everything else in v1.2 (coach notes, coaching sessions,
-- assigned tasks, media visible to the coach) depends on.
create table public.coach_students (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade unique,
  created_at timestamptz not null default now()
);

alter table public.coach_students enable row level security;
grant select, insert, update, delete on public.coach_students to authenticated;

-- Admin manages assignments end to end.
create policy "coach_students_admin_all"
  on public.coach_students for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A coach can see their own roster (their panel will need this later).
create policy "coach_students_coach_read_own"
  on public.coach_students for select
  to authenticated
  using (coach_id = (select auth.uid()));
