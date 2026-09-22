-- Fixes a real regression that silently broke EVERY student-initiated write
-- to coaching_sessions, including Görüşmeni Değerlendir (submitSessionRating)
-- -- the exact "Beklenmeyen bir hata oluştu" the student was hitting on
-- Gönder, with no #441 crash this time (the action's own try/catch is
-- working correctly; the underlying database write itself was failing).
--
-- What happened: 0043 (drop_dead_code) dropped coaching_sessions.evaluated_at
-- and correctly restated prevent_student_session_tampering() without it.
-- 0084 (session_payment_tracking) restated the same function again to add
-- the new is_paid column to its guarded-fields list, but was written against
-- the OLDER 0020 version of the function body (which still referenced
-- evaluated_at) instead of 0043's already-fixed one -- so its
-- `create or replace function` silently reintroduced
-- `new.evaluated_at is distinct from old.evaluated_at`.
--
-- PL/pgSQL doesn't validate NEW/OLD field references at CREATE FUNCTION
-- time (they're resolved against the actual table row only when the
-- trigger fires), so this compiled fine and shipped invisibly. But every
-- time the trigger actually ran for a student-initiated UPDATE (a coach's
-- own updates bypass this branch entirely via the coach_students exists
-- check), it hit `record "new" has no field "evaluated_at"` and the whole
-- UPDATE failed -- 100% of the time, for every student, on every rating
-- attempt, since submitSessionRating's UPDATE always goes through this
-- exact trigger.
--
-- This restates the function one more time, from 0084's version, with only
-- the evaluated_at clause removed (keeping the is_paid clause 0084 added).

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

notify pgrst, 'reload schema';

-- Verification: the function body must no longer mention evaluated_at
-- (expect false) and must still guard is_paid (expect true).
select
  position('evaluated_at' in pg_get_functiondef('public.prevent_student_session_tampering()'::regprocedure)) > 0
    as still_references_evaluated_at,
  position('is_paid' in pg_get_functiondef('public.prevent_student_session_tampering()'::regprocedure)) > 0
    as still_guards_is_paid;
