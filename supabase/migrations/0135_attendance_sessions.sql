-- Yoklama (event attendance) with SESSIONS.
--
-- An event / seminar can have several sessions (oturum). The coach first says how many sessions the event has, then marks each student
-- Geldi / Gelmedi for EACH session. Two changes:
--
--   1. public.announcement_attendance (0104) gets a session_number column. Until now it held ONE status per (announcement, student);
--      every existing row becomes "session 1" (the default), so nothing is lost and old records still mean exactly what they meant.
--      The unique key becomes (announcement_id, student_id, session_number).
--   2. public.announcement_attendance_config: one row per event with its session_count (1..20). The count belongs to the EVENT, not to a
--      coach, so it is shared: any coach (or an admin) can set it, everybody signed in can read it (the parent's report card needs it).
--      Events that already have attendance rows get session_count = 1.
--
-- The RSVP the student gave (announcement_rsvps) is untouched; the parent's report card compares it with the attendance to flag
-- "said they would come, but did not" (computed in the app, nothing stored).
--
-- Row-level security of announcement_attendance is unchanged (coach: own roster; admin: all; student / parent: read their own).
-- Idempotent: safe to run more than once. Rollback: see the bottom.

alter table public.announcement_attendance
  add column if not exists session_number int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.announcement_attendance'::regclass and conname = 'announcement_attendance_session_number_check'
  ) then
    alter table public.announcement_attendance
      add constraint announcement_attendance_session_number_check check (session_number >= 1 and session_number <= 20);
  end if;
end
$$;

-- Replace the one-status-per-student unique key (announcement_id, student_id) by one that includes the session.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.announcement_attendance'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['announcement_id', 'student_id']
  loop
    execute format('alter table public.announcement_attendance drop constraint %I', c.conname);
  end loop;
end
$$;

create unique index if not exists announcement_attendance_session_unique
  on public.announcement_attendance (announcement_id, student_id, session_number);

create table if not exists public.announcement_attendance_config (
  announcement_id uuid primary key references public.announcements(id) on delete cascade,
  session_count int not null check (session_count >= 1 and session_count <= 20),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Events that already have attendance recorded were single-session events.
insert into public.announcement_attendance_config (announcement_id, session_count)
select distinct a.announcement_id, 1 from public.announcement_attendance a
on conflict (announcement_id) do nothing;

alter table public.announcement_attendance_config enable row level security;
grant select, insert, update, delete on public.announcement_attendance_config to authenticated;

drop policy if exists "attendance_config_read" on public.announcement_attendance_config;
create policy "attendance_config_read" on public.announcement_attendance_config for select to authenticated
  using (true);

-- Any coach with students (the same test the attendance policy itself uses) or an admin may set an event's session count.
drop policy if exists "attendance_config_coach_write" on public.announcement_attendance_config;
create policy "attendance_config_coach_write" on public.announcement_attendance_config for all to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid())))
  with check (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid())));

drop policy if exists "attendance_config_admin_all" on public.announcement_attendance_config;
create policy "attendance_config_admin_all" on public.announcement_attendance_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

-- Verification: expect session_column = true, config_table = true, unique_with_session = true, old_unique_gone = true.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcement_attendance' and column_name = 'session_number') as session_column,
  to_regclass('public.announcement_attendance_config') is not null as config_table,
  to_regclass('public.announcement_attendance_session_unique') is not null as unique_with_session,
  not exists (
    select 1 from pg_constraint con
    where con.conrelid = 'public.announcement_attendance'::regclass and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname::text)
           from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k) = array['announcement_id', 'student_id']
  ) as old_unique_gone;

-- ROLLBACK (only if ever needed; sessions beyond 1 would have to be deleted first):
--   delete from public.announcement_attendance where session_number > 1;
--   drop index public.announcement_attendance_session_unique;
--   alter table public.announcement_attendance add unique (announcement_id, student_id);
--   alter table public.announcement_attendance drop column session_number;
--   drop table public.announcement_attendance_config;
