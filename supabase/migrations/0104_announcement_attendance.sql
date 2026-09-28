-- Post-event attendance (Yoklama), tracked SEPARATELY from the student's own
-- RSVP response (announcement_rsvps.response) -- they're two different facts
-- recorded by two different people at two different times: the student's
-- own before-the-fact answer, and the coach's after-the-fact record of who
-- actually showed up. A "Cevap Bekleyenler" student has no announcement_rsvps
-- row at all (response is NOT NULL there), so attendance can't live as a
-- column on that table without either making response nullable or fabricating
-- a fake response just to hang an attendance value off it -- a dedicated
-- table sidesteps that entirely and keeps each table's NOT NULL/check
-- constraints meaningful.
create type public.attendance_status as enum ('attended', 'not_attended');

create table public.announcement_attendance (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.attendance_status not null,
  marked_at timestamptz not null default now(),
  marked_by uuid references public.profiles(id) on delete set null,
  unique (announcement_id, student_id)
);

create index announcement_attendance_student_idx on public.announcement_attendance (student_id);
create index announcement_attendance_announcement_idx on public.announcement_attendance (announcement_id);

alter table public.announcement_attendance enable row level security;
grant select, insert, update, delete on public.announcement_attendance to authenticated;

-- A coach can mark attendance for their own roster, for ANY response state
-- (attending/not_attending/no response at all) -- someone who RSVP'd "not
-- attending" can still show up, and someone who never answered still might.
create policy "announcement_attendance_coach_all" on public.announcement_attendance for all to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = announcement_attendance.student_id
  ))
  with check (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = announcement_attendance.student_id
  ));

create policy "announcement_attendance_admin_all" on public.announcement_attendance for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Read-only for the student/parent -- same shape as announcement_rsvps'
-- own read policies (0052/0053), no write path for either.
create policy "announcement_attendance_student_read" on public.announcement_attendance for select to authenticated
  using (student_id = (select auth.uid()));

create policy "announcement_attendance_parent_read" on public.announcement_attendance for select to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = announcement_attendance.student_id
  ));

notify pgrst, 'reload schema';
