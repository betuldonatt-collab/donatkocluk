-- Coach workspace: Profile, Settings (incl. "Student Radar" alert
-- thresholds), and a persisted Notifications center.
--
-- Design notes:
--   - All three tables are keyed purely by coach_id, one row per coach --
--     no student join needed in RLS, unlike coach_notes. Mirrors
--     coach_calendar_blocks' simple owner-only shape (0011).
--   - notifications additionally carries an optional student_id (nullable
--     -- checklist-done notifications aren't always about a student, e.g.
--     a general coach_task).
--   - No admin-only tampering trigger here (unlike profiles' exit-status
--     fields) -- these are entirely coach-owned data, not a
--     student-lifecycle field an admin must gate from the coach.

create type public.coach_specialization as enum ('yks_sayisal', 'yks_ea', 'yks_sozel', 'yks_ydt', 'lgs_ortaokul');

create table public.coach_profiles (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  specialization public.coach_specialization,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  university text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_profiles enable row level security;
grant select, insert, update, delete on public.coach_profiles to authenticated;

create policy "coach_profiles_admin_all"
  on public.coach_profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coach_profiles_coach_all"
  on public.coach_profiles for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create table public.coach_settings (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  inactivity_threshold_days int not null default 3,
  critical_completion_threshold_pct int not null default 50,
  success_alert_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_settings enable row level security;
grant select, insert, update, delete on public.coach_settings to authenticated;

create policy "coach_settings_admin_all"
  on public.coach_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coach_settings_coach_all"
  on public.coach_settings for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create type public.notification_type as enum (
  'inactive_student',
  'critical_completion_drop',
  'success_completion',
  'note_revision_requested',
  'checklist_task_done'
);
create type public.notification_status as enum ('active', 'done');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  status public.notification_status not null default 'active',
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index notifications_coach_idx on public.notifications (coach_id, status, created_at desc);

alter table public.notifications enable row level security;
grant select, insert, update, delete on public.notifications to authenticated;

create policy "notifications_admin_all"
  on public.notifications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "notifications_coach_all"
  on public.notifications for all
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));
