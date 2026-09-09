-- Membership cancellation ("Üyeliği Sonlandır") retention flow. Never
-- deletes anything -- just records that the student asked to leave and
-- why, for admin follow-up.
--
-- Deliberately a separate table, not columns on profiles: profiles has a
-- profiles_select_by_coach policy granting a coach every column of their
-- assigned students' rows, and RLS can't restrict which columns a policy
-- exposes. Putting cancellation_requested/reason there would hand them
-- straight to the coach regardless of intent. This table gets an admin
-- policy and a student-own-row policy -- and no coach policy at all,
-- which is the only way to actually guarantee the coach can't see it.
create table public.account_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create index account_cancellation_requests_student_idx on public.account_cancellation_requests (student_id);

alter table public.account_cancellation_requests enable row level security;
grant select, insert on public.account_cancellation_requests to authenticated;

create policy "cancellation_requests_admin_read"
  on public.account_cancellation_requests for select
  to authenticated
  using (public.is_admin());

create policy "cancellation_requests_student_own"
  on public.account_cancellation_requests for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "cancellation_requests_student_insert"
  on public.account_cancellation_requests for insert
  to authenticated
  with check (student_id = (select auth.uid()));
