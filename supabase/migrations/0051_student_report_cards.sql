-- Karne v2: cycle-based, archived, coach-approved report cards. Replaces
-- last session's live calendar-month computation with a permanent
-- snapshot table -- a student only ever sees a row once their coach has
-- reviewed it and flipped it to 'approved'.
create type public.report_card_status as enum ('draft', 'approved');

create table public.student_report_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  cycle_number int not null,
  range_start date not null,
  range_end date not null,
  status public.report_card_status not null default 'draft',
  coach_notes text,
  -- NetSummary snapshot: { tyt: {current,previous}, ayt: {current,previous} }
  stats jsonb not null,
  -- KarneTopicRow[] snapshot (lib/karne.ts's existing computeAylikKarne output shape)
  topic_mistakes jsonb not null,
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, cycle_number)
);

create index student_report_cards_student_idx on public.student_report_cards (student_id, cycle_number desc);
create index student_report_cards_coach_idx on public.student_report_cards (coach_id, status);

alter table public.student_report_cards enable row level security;
grant select, insert, update, delete on public.student_report_cards to authenticated;

-- Coach: full access to their own roster's report cards -- generation AND
-- approval both happen here, so unlike coach_notes there's no separate
-- admin-approval gate to enforce; the coach IS the approver.
create policy "student_report_cards_coach_all"
  on public.student_report_cards for all
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_report_cards.student_id
    )
  )
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = student_report_cards.student_id
    )
  );

create policy "student_report_cards_admin_all"
  on public.student_report_cards for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Student: read-only, approved-only -- a draft is invisible to the
-- student it's about until the coach approves it. No precedent for this
-- in coach_notes (which never gates the student's own read access), so
-- this mirrors coach_notes_parent_read's status-gate pattern instead,
-- applied to the student role.
create policy "student_report_cards_student_read"
  on public.student_report_cards for select
  to authenticated
  using (student_id = (select auth.uid()) and status = 'approved');

notify pgrst, 'reload schema';
