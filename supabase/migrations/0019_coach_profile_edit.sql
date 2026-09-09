-- Coach WRITE access on a roster student's own profile fields (city,
-- phone, parent contact, target university/department/ranking, school,
-- OBP, academic-status flags, favorite/difficult subjects) for the new
-- "Kişisel Akademik Profil" edit flow on the student detail page. Same
-- coach_students-join pattern as every other coach write policy.
--
-- coaching_start_date / assigned_meeting_day / remaining_sessions stay
-- admin-only exactly as before: prevent_student_system_field_tampering
-- (0009, extended in 0012) already rejects any non-admin write to those
-- three columns regardless of which RLS policy let the UPDATE through,
-- so this migration doesn't touch that trigger and those fields remain
-- out of the coach's edit form. profiles_prevent_self_role_change (0001)
-- likewise still blocks a role change from a non-admin. Both safety nets
-- apply to this new coach path unchanged -- this migration is additive
-- only, same as 0013/0014's coach resource-tracking access.
create policy "profiles_coach_update"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = profiles.id
    )
  )
  with check (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = profiles.id
    )
  );
