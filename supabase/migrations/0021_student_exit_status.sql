-- Student exit status ("İstatistiklerim" coach retention/churn analytics):
-- lets an admin mark a student inactive with an exit reason, without
-- touching coach_students at all.
--
-- Design notes:
--   - coach_students is hard-deleted on unassignment today (assignCoach in
--     app/admin/actions.ts) and student_id is unique -- no history is kept
--     there. Rather than changing that (bigger, riskier, touches a flow
--     this feature doesn't need to touch), "active/inactive" lives on
--     profiles itself, independent of the coach_students link. Marking a
--     student inactive leaves coach_students untouched, so the coach
--     keeps full historical visibility (sessions, stay duration) for the
--     new stats page automatically.
--   - is_active/exit_category/exit_note/exited_at are "system fields" in
--     the same sense as coaching_start_date/assigned_meeting_day/
--     remaining_sessions (0009/0012) -- admin-set, student-read-only,
--     coach-read-only. Extends the existing
--     prevent_student_system_field_tampering trigger via create or
--     replace rather than adding a second trigger, keeping a single place
--     that lists every student-immutable profile column.
--   - profiles_select_by_coach (0007) already grants coaches read access
--     to their students' profiles, covering these 4 new columns for free.
--     But profiles_update_own (0001) is `using (id = auth.uid())` only --
--     no admin bypass, unlike the select policy. Admin has never needed
--     UPDATE on profiles before (the existing coach-assignment feature
--     only ever touches coach_students), so this gap was never hit until
--     now. Add an explicit admin UPDATE policy, additive alongside
--     profiles_update_own (permissive policies OR together), matching the
--     "for all" admin-bypass shape already used on every other table
--     (coaching_sessions_admin_all, coach_students_admin_all, etc.).

create type public.student_exit_category as enum (
  'graduated',
  'grade_transition',
  'financial',
  'motivation',
  'system'
);

alter table public.profiles
  add column is_active boolean not null default true,
  add column exit_category public.student_exit_category,
  add column exit_note text,
  add column exited_at timestamptz;

alter table public.profiles
  add constraint profiles_exit_category_requires_inactive
    check (exit_category is null or is_active = false);

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
    then
      raise exception 'Only an admin can change coaching_start_date, assigned_meeting_day, remaining_sessions, or exit status fields';
    end if;
  end if;
  return new;
end;
$$;
