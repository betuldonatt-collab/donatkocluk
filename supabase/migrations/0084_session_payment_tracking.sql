-- Session payment tracking.
--
-- Design notes:
--   - is_paid lives on coaching_sessions itself, not a new student_sessions
--     table -- this table already IS "a session" (scheduled_at, outcome,
--     meeting_url, evaluation_notes, ratings); a parallel table would fork
--     the same real-world entity into two disconnected bookkeeping systems.
--   - Remaining-session balance (paid count minus completed count) is
--     computed in application code from is_paid/outcome, not stored --
--     same convention as every other derived count in this app (parent's
--     completedCount/remaining, coach's quota math, etc).
--   - Product decision: the balance is now allowed to go negative (a
--     student who's had more completed sessions than paid-for sees a
--     negative number as a payment reminder). This is incompatible with
--     auto_unassign_on_quota_completion (0027), which hard-cuts the coach
--     off at exactly zero -- so that trigger is dropped below.
--     total_session_quota / quota_cycle_start_at / pool_status and the
--     admin's manual "Kotasını Tamamladı" button (send-to-pool) all stay
--     in place, just no longer auto-fired by this trigger.

alter table public.coaching_sessions
  add column is_paid boolean not null default false;

-- prevent_student_session_tampering (0020) whitelists exactly which
-- columns a student's own coaching_sessions_student_rate UPDATE may touch.
-- is_paid must join that blocked-fields list, or a student could mark
-- their own sessions paid through that same policy.
create or replace function public.prevent_student_session_tampering()
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
      or new.is_paid is distinct from old.is_paid
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

drop trigger if exists coaching_sessions_auto_unassign on public.coaching_sessions;
drop function if exists public.auto_unassign_on_quota_completion();

notify pgrst, 'reload schema';
