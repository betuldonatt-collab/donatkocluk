-- Coach Student List / Student Detail dashboards.
--
--   - remaining_sessions is "system info" like coaching_start_date and
--     assigned_meeting_day before it: extends the SAME trigger (via
--     create or replace) rather than adding a second one, so there's a
--     single place that lists every student-immutable profile column.
--     Coaches already have no UPDATE policy on profiles at all (SELECT
--     only, from 0007), so "coach read-only" already holds structurally.
--   - paragraf_problem_entries had no coach access whatsoever until now
--     (only the student-own-row policy from 0002) -- needed so the
--     coach's Grafikler tab can actually read a student's Paragraf/
--     Problem history. Read-only: coaches don't edit this data.

alter table public.profiles
  add column remaining_sessions int not null default 4;

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
    then
      raise exception 'Only an admin can change coaching_start_date, assigned_meeting_day, or remaining_sessions';
    end if;
  end if;
  return new;
end;
$$;

create policy "paragraf_problem_entries_coach_read"
  on public.paragraf_problem_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = paragraf_problem_entries.student_id
    )
  );
