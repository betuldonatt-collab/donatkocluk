-- Parent Panel (Veli Paneli): the missing parent<->student relationship
-- (flagged as deferred since v1.1's CHANGELOG, never built), a session
-- quota field, and a global announcements table.
--
-- Design notes:
--   - parent_students is NOT unique on student_id (unlike coach_students)
--     -- a student can have multiple linked parent accounts (mother +
--     father), and a parent can be linked to multiple students (siblings).
--     A (parent_id, student_id) PAIR is unique, so the same link can't be
--     created twice.
--   - total_session_quota lives on profiles, same "system field" family
--     as remaining_sessions/is_active/exit_category -- admin-only write,
--     added to the existing prevent_student_system_field_tampering guard.
--   - coach_notes_parent_read enforces the "only approved notes" rule at
--     the RLS layer itself, not just in the app query.
--   - announcements is not sensitive content -- readable by any
--     authenticated user; only an admin can write.

create table public.parent_students (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index parent_students_unique_pair on public.parent_students (parent_id, student_id);

alter table public.parent_students enable row level security;
grant select, insert, update, delete on public.parent_students to authenticated;

create policy "parent_students_admin_all"
  on public.parent_students for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "parent_students_parent_read"
  on public.parent_students for select
  to authenticated
  using (parent_id = (select auth.uid()));

alter table public.profiles add column total_session_quota int not null default 0;

create or replace function public.prevent_student_system_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.coaching_start_date is distinct from old.coaching_start_date
      or new.assigned_meeting_day is distinct from old.assigned_meeting_day
      or new.remaining_sessions is distinct from old.remaining_sessions
      or new.is_active is distinct from old.is_active
      or new.exit_category is distinct from old.exit_category
      or new.exit_note is distinct from old.exit_note
      or new.exited_at is distinct from old.exited_at
      or new.total_session_quota is distinct from old.total_session_quota
    then
      raise exception 'Only an admin can change a student''s system fields';
    end if;
  end if;
  return new;
end;
$$;

create policy "profiles_select_by_parent"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = profiles.id
    )
  );

create policy "student_tasks_parent_read"
  on public.student_tasks for select
  to authenticated
  using (
    exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = student_tasks.student_id
    )
  );

create policy "coaching_sessions_parent_read"
  on public.coaching_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = coaching_sessions.student_id
    )
  );

create policy "coach_notes_parent_read"
  on public.coach_notes for select
  to authenticated
  using (
    parent_share_status = 'approved'
    and exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = coach_notes.student_id
    )
  );

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  expiry_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
grant select, insert, update, delete on public.announcements to authenticated;

create policy "announcements_select_all"
  on public.announcements for select
  to authenticated
  using (true);

create policy "announcements_admin_write"
  on public.announcements for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
