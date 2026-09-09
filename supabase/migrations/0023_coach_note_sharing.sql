-- Parent-sharing approval workflow for coach_notes, plus unifying session-
-- evaluation notes and manual coach notes into one timeline data source.
--
-- Design notes:
--   - parent_share_status/admin_revision_note live on coach_notes, not a
--     separate table -- exactly one share-request lifecycle per note.
--   - Veli Görüşmesi (parent_meeting) notes can never be shared -- enforced
--     by a check constraint, not just hidden in the UI.
--   - Backfill: coach_notes previously only held manually-added notes; the
--     coach's session-evaluation notes lived solely on
--     coaching_sessions.evaluation_notes. Going forward,
--     evaluateSessionCompleted (app/coach/actions.ts) also inserts a
--     coach_notes row (type='main_session') per completed session, so the
--     new unified student-detail timeline can read coach_notes alone for
--     "notes" and only fall back to coaching_sessions for not_happened
--     entries. This one-time backfill mirrors every EXISTING completed
--     session's evaluation note so history isn't lost when the old
--     two-card view is replaced. coaching_sessions.evaluation_notes itself
--     is left untouched -- the read-only SessionDetailDialog on the coach
--     dashboard keeps reading it directly, unchanged.
--   - The workflow trigger mirrors the security-definer + is_admin()
--     tampering-guard pattern used everywhere else in this schema: a coach
--     may request sharing (-> 'pending') or resubmit after revision
--     (revision_requested -> 'pending'), and may never write
--     admin_revision_note or move a note straight to approved/rejected/
--     revision_requested -- only an admin (who bypasses the guard
--     entirely) can do those.

create type public.coach_note_share_status as enum ('none', 'pending', 'approved', 'rejected', 'revision_requested');

alter table public.coach_notes
  add column parent_share_status public.coach_note_share_status not null default 'none',
  add column admin_revision_note text;

alter table public.coach_notes
  add constraint coach_notes_parent_meeting_not_shareable
    check (type <> 'parent_meeting' or parent_share_status = 'none');

insert into public.coach_notes (student_id, coach_id, type, content, created_at, updated_at)
select student_id, coach_id, 'main_session', coalesce(evaluation_notes, ''), coalesce(evaluated_at, scheduled_at), coalesce(evaluated_at, scheduled_at)
from public.coaching_sessions
where outcome = 'completed';

create function public.enforce_coach_note_share_workflow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.admin_revision_note is distinct from old.admin_revision_note then
    raise exception 'Only an admin can set the revision note';
  end if;
  if tg_op = 'INSERT' and new.admin_revision_note is not null then
    raise exception 'Only an admin can set the revision note';
  end if;

  if tg_op = 'INSERT' then
    if new.parent_share_status not in ('none', 'pending') then
      raise exception 'Only an admin can set this share status';
    end if;
  elsif new.parent_share_status is distinct from old.parent_share_status then
    if new.parent_share_status <> 'pending' then
      raise exception 'Only an admin can approve, reject, or request revision';
    end if;
    if old.parent_share_status not in ('none', 'revision_requested') then
      raise exception 'Note is already pending or shared';
    end if;
  end if;

  return new;
end;
$$;

create trigger coach_notes_enforce_share_workflow
  before insert or update on public.coach_notes
  for each row execute function public.enforce_coach_note_share_workflow();
