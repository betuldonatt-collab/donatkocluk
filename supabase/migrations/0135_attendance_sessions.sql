-- Yoklama (event attendance) with SESSIONS, retroactive entry and LOCKING.
--
-- An event / seminar can have several sessions (oturum). The coach first says how many sessions the event has, then marks each student
-- Geldi / Gelmedi for EACH session -- also for past / expired events -- and can finally lock (Kilitle) the roll call. Three parts:
--
--   1. public.announcement_attendance (0104) gets a session_number column. Until now it held ONE status per (announcement, student);
--      every existing row becomes "session 1" (the default), so nothing is lost and old records still mean exactly what they meant.
--      The unique key becomes (announcement_id, student_id, session_number).
--   2. public.announcement_attendance_config: one row per event with its session_count (1..20). The count belongs to the EVENT, not to a
--      coach, so it is shared: any coach (or an admin) can set it, everybody signed in can read it (the report cards need it).
--      Events that already have attendance rows get session_count = 1. Once any coach has locked the event, the count is frozen.
--   3. public.announcement_attendance_locks: one row per (event, coach) = "this coach's roll call for this event is final". A lock is per
--      coach on purpose: two coaches share an event, and one coach finishing their students must not stop the other from taking theirs.
--      While a lock exists, NOBODY can insert / change / delete the attendance rows of that coach's students for that event -- enforced by a
--      trigger, so it holds for every client, the API and the admin policies included. There is no unlock in the app. (If a lock was set by
--      mistake, the database owner can delete its row in the SQL editor: delete from public.announcement_attendance_locks where ...)
--      Deleting an event or a student still cascades normally.
--
-- The RSVP the student gave (announcement_rsvps) is untouched; the report cards compare it with the attendance to flag
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

-- ---- the event's session count -----------------------------------------------------------------------------------------------

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

-- ---- locks -------------------------------------------------------------------------------------------------------------------

create table if not exists public.announcement_attendance_locks (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  locked_at timestamptz not null default now(),
  primary key (announcement_id, coach_id)
);

alter table public.announcement_attendance_locks enable row level security;
grant select, insert, update, delete on public.announcement_attendance_locks to authenticated;

-- Who has locked what is not sensitive and every coach needs it (the session count freezes once anyone locked).
drop policy if exists "attendance_locks_read" on public.announcement_attendance_locks;
create policy "attendance_locks_read" on public.announcement_attendance_locks for select to authenticated
  using (true);

-- A coach can only create their OWN lock. There is deliberately no update / delete policy for coaches: a lock cannot be undone from the app.
drop policy if exists "attendance_locks_coach_insert" on public.announcement_attendance_locks;
create policy "attendance_locks_coach_insert" on public.announcement_attendance_locks for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()))
  );

drop policy if exists "attendance_locks_admin_all" on public.announcement_attendance_locks;
create policy "attendance_locks_admin_all" on public.announcement_attendance_locks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The guard: while the (event, coach) lock exists, the attendance rows of that coach's students for that event are frozen.
-- SECURITY DEFINER because the writer may be ANOTHER coach / an admin, who cannot see the locking coach's students through RLS.
-- pg_trigger_depth() > 1 lets cascades through (deleting the event or the student removes their rows as before).
create or replace function public.guard_locked_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select exists (
      select 1
      from public.announcement_attendance_locks l
      join public.coach_students cs on cs.coach_id = l.coach_id
      where l.announcement_id = old.announcement_id and cs.student_id = old.student_id
    ) into v_locked;
  end if;
  if not v_locked and tg_op in ('INSERT', 'UPDATE') then
    select exists (
      select 1
      from public.announcement_attendance_locks l
      join public.coach_students cs on cs.coach_id = l.coach_id
      where l.announcement_id = new.announcement_id and cs.student_id = new.student_id
    ) into v_locked;
  end if;

  if v_locked then
    raise exception 'attendance_locked: bu etkinliğin yoklaması kilitli, değiştirilemez.';
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists announcement_attendance_guard_locked on public.announcement_attendance;
create trigger announcement_attendance_guard_locked
  before insert or update or delete on public.announcement_attendance
  for each row execute function public.guard_locked_attendance();

-- Once any coach has locked an event, its session count is frozen (a lowered count would hide locked sessions on the report cards).
create or replace function public.guard_locked_attendance_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.session_count is distinct from old.session_count) then
    if exists (select 1 from public.announcement_attendance_locks l where l.announcement_id = old.announcement_id) then
      raise exception 'attendance_locked: yoklama kilitlendiği için oturum sayısı değiştirilemez.';
    end if;
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists announcement_attendance_config_guard_locked on public.announcement_attendance_config;
create trigger announcement_attendance_config_guard_locked
  before update or delete on public.announcement_attendance_config
  for each row execute function public.guard_locked_attendance_config();

notify pgrst, 'reload schema';

-- Verification: expect every column true.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcement_attendance' and column_name = 'session_number') as session_column,
  to_regclass('public.announcement_attendance_config') is not null as config_table,
  to_regclass('public.announcement_attendance_locks') is not null as locks_table,
  to_regclass('public.announcement_attendance_session_unique') is not null as unique_with_session,
  not exists (
    select 1 from pg_constraint con
    where con.conrelid = 'public.announcement_attendance'::regclass and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname::text)
           from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k) = array['announcement_id', 'student_id']
  ) as old_unique_gone,
  exists (select 1 from pg_trigger where tgname = 'announcement_attendance_guard_locked' and not tgisinternal) as attendance_guard,
  exists (select 1 from pg_trigger where tgname = 'announcement_attendance_config_guard_locked' and not tgisinternal) as config_guard;

-- ROLLBACK (only if ever needed; sessions beyond 1 would have to be deleted first):
--   drop trigger announcement_attendance_guard_locked on public.announcement_attendance;
--   drop trigger announcement_attendance_config_guard_locked on public.announcement_attendance_config;
--   drop function public.guard_locked_attendance();
--   drop function public.guard_locked_attendance_config();
--   drop table public.announcement_attendance_locks;
--   delete from public.announcement_attendance where session_number > 1;
--   drop index public.announcement_attendance_session_unique;
--   alter table public.announcement_attendance add unique (announcement_id, student_id);
--   alter table public.announcement_attendance drop column session_number;
--   drop table public.announcement_attendance_config;
