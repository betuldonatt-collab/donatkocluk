-- A student can dismiss a DECIDED (approved/rejected) long-session record from
-- their own "Uzun Süre Kayıtların" card. Soft dismiss, not a delete: the coach's
-- history (and the tracked-time audit trail) keeps the row; only the student's
-- own dashboard stops showing it.
--
-- focus_session_reviews is deliberately not writable by students (nobody can
-- approve their own time), so the dismiss goes through a SECURITY DEFINER
-- function that touches ONLY this one column, on the caller's own row, and
-- only once the coach has decided it -- a still-pending review can't be hidden.
alter table public.focus_session_reviews
  add column if not exists student_dismissed_at timestamptz;

create or replace function public.dismiss_focus_review(p_review_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  update public.focus_session_reviews
    set student_dismissed_at = now()
    where id = p_review_id
      and student_id = auth.uid()
      and status <> 'pending';
  return found;
end;
$$;

revoke all on function public.dismiss_focus_review(uuid) from public;
grant execute on function public.dismiss_focus_review(uuid) to authenticated;

notify pgrst, 'reload schema';
