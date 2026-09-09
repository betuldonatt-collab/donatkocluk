-- Proposed Deletion List cleanup, reviewed and approved by the user.
-- Every column dropped here that was still being WRITTEN by app code has
-- a matching code change in the same commit removing that write -- see
-- app/admin/actions.ts, app/coach/actions.ts, app/coach/dashboard/types.ts.

-- Dead tables: task_completions was explicitly superseded by student_tasks
-- (see migration 0005's own header comment); coach_task_templates was a
-- coach "Hızlı Ekle" quick-add palette, fully built at the DB/RLS layer
-- but never wired into any UI or Server Action. Both have zero references
-- anywhere in app/ or lib/.
drop table if exists public.task_completions;
drop table if exists public.coach_task_templates;

-- signup_requests: reviewed_by/reviewed_at/rejection_note were written on
-- approve/reject (app/admin/actions.ts) but never read back anywhere --
-- no "review history" UI was ever built. Write statements removed in the
-- same change. signup_requests_anon_insert (0030) guarded against a
-- public submitter forging an already-reviewed request by checking
-- reviewed_by/reviewed_at is null -- with both columns gone there's
-- nothing left to forge, so the policy is recreated keeping only the
-- still-meaningful status check.
drop policy "signup_requests_anon_insert" on public.signup_requests;
create policy "signup_requests_anon_insert"
  on public.signup_requests for insert
  to anon
  with check (status = 'pending');

alter table public.signup_requests
  drop column reviewed_by,
  drop column reviewed_at,
  drop column rejection_note;

-- week_locks: locked_by was written on lock creation (app/coach/actions.ts
-- lockWeek), locked_at only ever carried its own insert-time default --
-- neither was ever selected/rendered anywhere.
alter table public.week_locks
  drop column locked_by,
  drop column locked_at;

-- coaching_sessions.evaluated_at: written on session evaluation
-- (app/coach/actions.ts) and carried in the CoachingSession type, but
-- never read back in any UI or logic. The prevent_student_session_tampering
-- guard trigger (0020) also referenced it in its "which columns can a
-- student never touch" check -- replaced here to drop that clause before
-- the column itself goes away.
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

alter table public.coaching_sessions drop column evaluated_at;

-- student_daily_stats.updated_by: stamped entirely by a trigger, never
-- selected/rendered by any "Son düzenleyen" UI that was ultimately never
-- built. The trigger also stamps updated_at (which IS kept), so it's
-- rewritten -- not just dropped -- to keep that half; renamed to match
-- what it actually does now.
drop trigger student_daily_stats_stamp on public.student_daily_stats;
drop function public.stamp_daily_stats_updated_by();

create function public.stamp_daily_stats_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger student_daily_stats_stamp
  before insert or update on public.student_daily_stats
  for each row execute function public.stamp_daily_stats_updated_at();

alter table public.student_daily_stats drop column updated_by;

notify pgrst, 'reload schema';
