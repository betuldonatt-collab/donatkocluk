-- Student post-session ratings ("Görüşmelerim" CRM): lets a student rate
-- and leave feedback on a completed coaching session, and lets the coach
-- see an anonymous aggregate of it in the new monthly "Görüşmelerim"
-- calendar.
--
-- Design notes:
--   - student_rating/student_feedback/rated_at live on coaching_sessions
--     itself (not a new table) -- exactly one rating per session, 1:1,
--     same reasoning as evaluation_notes/missed_reason living here rather
--     than a separate table (0011).
--   - coaching_sessions_student_read only ever granted SELECT; this adds
--     the first UPDATE policy for students, scoped to "own row only" at
--     the RLS layer -- the trigger below restricts *which columns* that
--     UPDATE may touch, mirroring prevent_student_task_core_tampering
--     (0005) / prevent_student_system_field_tampering (0009). Unlike
--     student_tasks (which has an is_coach_assigned=false escape hatch
--     for a student's own custom tasks), every coaching_sessions row is
--     coach-created, so a student-initiated update is ALWAYS restricted,
--     no exception branch needed.
--   - A student can only rate a 'completed' session -- enforced by a
--     check constraint referencing outcome directly. Since the trigger
--     already blocks a student from changing `outcome` itself,
--     NEW.outcome == OLD.outcome on every student update, so this
--     constraint alone is sufficient.
--   - Write-once: once student_rating is set, the trigger blocks any
--     further student-initiated change to student_rating/student_feedback
--     /rated_at -- a rating is locked the moment it's submitted.
--   - Coach anonymity is a UI-layer guarantee (the coach app never
--     queries/renders a per-session rating tied to a student, only
--     same-day aggregates), not an RLS restriction -- the coach's
--     existing coaching_sessions_coach_all policy already grants full
--     row access to their own students' sessions, and an admin can see
--     everything, matching every other column on this table.

alter table public.coaching_sessions
  add column student_rating smallint,
  add column student_feedback text,
  add column rated_at timestamptz;

alter table public.coaching_sessions
  add constraint coaching_sessions_student_rating_range
    check (student_rating is null or (student_rating between 1 and 5)),
  add constraint coaching_sessions_student_rating_requires_completed
    check (student_rating is null or outcome = 'completed');

-- Additive: coexists with coaching_sessions_student_read (select-only) and
-- coaching_sessions_coach_all / coaching_sessions_admin_all (for all) --
-- Postgres ORs together every permissive policy that matches the command,
-- so this only ever *adds* an update path for the student's own row. This
-- is the exact same multi-policy shape already proven by
-- student_tasks_student_update coexisting with student_tasks_coach_all
-- (0005).
create policy "coaching_sessions_student_rate"
  on public.coaching_sessions for update
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- Blocks a student (not their coach, not an admin) from using the policy
-- above to rewrite anything except their own rating/feedback, and blocks
-- them from changing a rating that's already been submitted.
create function public.prevent_student_session_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin()
    and not exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = old.student_id
    )
  then
    if new.student_id is distinct from old.student_id
      or new.coach_id is distinct from old.coach_id
      or new.scheduled_at is distinct from old.scheduled_at
      or new.meeting_url is distinct from old.meeting_url
      or new.outcome is distinct from old.outcome
      or new.evaluation_notes is distinct from old.evaluation_notes
      or new.missed_reason is distinct from old.missed_reason
      or new.missed_reason_note is distinct from old.missed_reason_note
      or new.evaluated_at is distinct from old.evaluated_at
    then
      raise exception 'Only the assigning coach can change a session''s core details';
    end if;

    if old.student_rating is not null
      and (
        new.student_rating is distinct from old.student_rating
        or new.student_feedback is distinct from old.student_feedback
        or new.rated_at is distinct from old.rated_at
      )
    then
      raise exception 'Bu görüşme zaten değerlendirildi, değerlendirme değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

create trigger coaching_sessions_prevent_student_tampering
  before update on public.coaching_sessions
  for each row execute function public.prevent_student_session_tampering();
