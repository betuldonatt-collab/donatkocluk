-- Item 5: postpone cap on the coach's own daily checklist
alter table public.coach_tasks add column postponed_count int not null default 0;

-- Items 8-9: event date drives the 7-day visibility window; requires_rsvp is independent
-- (an event_date-bearing announcement isn't necessarily RSVP-gated, e.g. a pure FYI).
alter table public.announcements add column event_date date;
alter table public.announcements add column requires_rsvp boolean not null default false;

-- Item 8: student RSVPs, coach-readable
create type public.rsvp_response as enum ('attending', 'not_attending');

create table public.announcement_rsvps (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  response public.rsvp_response not null,
  decline_reason text,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, student_id),
  constraint announcement_rsvps_decline_reason_required
    check (response = 'attending' or (decline_reason is not null and length(trim(decline_reason)) > 0))
);

create index announcement_rsvps_student_idx on public.announcement_rsvps (student_id);
create index announcement_rsvps_announcement_idx on public.announcement_rsvps (announcement_id, response);

alter table public.announcement_rsvps enable row level security;
grant select, insert, update, delete on public.announcement_rsvps to authenticated;

create policy "announcement_rsvps_student_own" on public.announcement_rsvps for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

create policy "announcement_rsvps_coach_read" on public.announcement_rsvps for select to authenticated
  using (exists (select 1 from public.coach_students cs where cs.coach_id = (select auth.uid()) and cs.student_id = announcement_rsvps.student_id));

create policy "announcement_rsvps_admin_all" on public.announcement_rsvps for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
