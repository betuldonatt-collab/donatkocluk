alter table public.announcements add column event_time time;

-- announcement_rsvps had read policies for the student's own row, the
-- assigned coach's roster, and admin -- but no policy at all for a parent
-- to read their linked student's response, even though the parent panel
-- is meant to show it read-only. Mirrors announcement_rsvps_coach_read's
-- pattern exactly, just joined through parent_students instead of
-- coach_students.
create policy "announcement_rsvps_parent_read"
  on public.announcement_rsvps for select to authenticated
  using (exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = announcement_rsvps.student_id
  ));

notify pgrst, 'reload schema';
