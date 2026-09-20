-- =============================================================================
-- Suspiciously long focus sessions need coach approval ("Onay Bekleyen Süreler")
--
-- A single Süre Tut session that ends up longer than 6 hours (21600 s) is NOT
-- credited to the task. Its seconds are parked in focus_session_reviews with
-- status 'pending' until the student's coach approves them as-is, approves a
-- reduced figure, or rejects them.
--
-- Because every leaderboard / chart / total reads student_tasks.
-- tracked_duration_seconds (get_daily_stopwatch_ranking, the coach roster,
-- Karne, "Tüm Zamanlar", weekly stats ...), keeping the flagged seconds OUT of
-- that column is what excludes them everywhere at once -- no per-query filter
-- to remember. Approval adds the (possibly reduced) seconds to the task, which
-- is the moment they start to count.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- === 1. Review table =========================================================

create table if not exists public.focus_session_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null references public.student_tasks (id) on delete cascade,

  -- What the student's timer showed when they (or the system) ended the session.
  seconds int not null check (seconds > 0),
  started_at timestamptz,
  ended_at timestamptz not null default now(),

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- What was actually credited: seconds as-is, a coach-reduced figure, or 0.
  approved_seconds int check (approved_seconds is null or (approved_seconds >= 0 and approved_seconds <= seconds)),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists focus_session_reviews_student_idx
  on public.focus_session_reviews (student_id, created_at desc);
create index if not exists focus_session_reviews_pending_idx
  on public.focus_session_reviews (student_id) where status = 'pending';

alter table public.focus_session_reviews enable row level security;

-- Read-only for everyone: rows are created by end_focus_session and resolved by
-- review_focus_session (both SECURITY DEFINER below). Nobody can insert/update
-- them directly, so a student can never approve their own time.
grant select on public.focus_session_reviews to authenticated;

drop policy if exists "focus_session_reviews_student_read" on public.focus_session_reviews;
create policy "focus_session_reviews_student_read" on public.focus_session_reviews for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "focus_session_reviews_coach_read" on public.focus_session_reviews;
create policy "focus_session_reviews_coach_read" on public.focus_session_reviews for select to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = focus_session_reviews.student_id
  ));

drop policy if exists "focus_session_reviews_admin_read" on public.focus_session_reviews;
create policy "focus_session_reviews_admin_read" on public.focus_session_reviews for select to authenticated
  using (public.is_admin());

-- === 2. end_focus_session: flag > 6 hours instead of crediting ================
-- Same signature and behaviour as 0078 for everything <= 6h. Over 6h, the
-- seconds go to focus_session_reviews and the task's total is left untouched.

create or replace function public.end_focus_session(p_task_id uuid, p_bank_through timestamptz)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_session public.focus_sessions;
  v_seconds int;
  v_new_total int;
begin
  select * into v_session from public.focus_sessions
    where student_id = auth.uid() and task_id = p_task_id
    for update;

  if not found then
    return null;
  end if;

  v_seconds := v_session.accumulated_seconds;
  if v_session.status = 'running' and v_session.run_started_at is not null then
    v_seconds := v_seconds + greatest(0,
      extract(epoch from (least(p_bank_through, now()) - v_session.run_started_at))::int);
  end if;

  if v_seconds > 21600 then
    -- Suspiciously long: park it for the coach. The ownership check mirrors the
    -- credit path below, so a session pointing at someone else's task can never
    -- create a review for it.
    if exists (select 1 from public.student_tasks where id = p_task_id and student_id = auth.uid()) then
      insert into public.focus_session_reviews (student_id, task_id, seconds, started_at, ended_at)
      values (auth.uid(), p_task_id, v_seconds, v_session.created_at, now());
    end if;

    select tracked_duration_seconds into v_new_total
      from public.student_tasks
      where id = p_task_id and student_id = auth.uid();
  else
    update public.student_tasks
      set tracked_duration_seconds = least(86400, tracked_duration_seconds + v_seconds),
          updated_at = now()
      where id = p_task_id and student_id = auth.uid()
      returning tracked_duration_seconds into v_new_total;
  end if;

  delete from public.focus_sessions where id = v_session.id;

  return v_new_total;
end;
$$;

grant execute on function public.end_focus_session(uuid, timestamptz) to authenticated;

-- === 3. review_focus_session: the coach's decision ============================
--   p_action = 'approve' : credits p_seconds (default: all of it) to the task.
--                          p_seconds may only be <= what was recorded, so the
--                          coach can reduce a 14 h session to 3 h, never inflate.
--   p_action = 'reject'  : credits nothing.
-- Only the student's own coach (or an admin) may decide, and only once
-- ('already_processed' otherwise -- e.g. a second tab or a co-coach).

create or replace function public.review_focus_session(
  p_review_id uuid,
  p_action text,
  p_seconds int default null
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_review public.focus_session_reviews;
  v_credit int;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'Geçersiz işlem.';
  end if;

  select * into v_review from public.focus_session_reviews where id = p_review_id for update;
  if not found then
    return 'not_found';
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1 from public.coach_students cs
      where cs.coach_id = auth.uid() and cs.student_id = v_review.student_id
    )
  ) then
    raise exception 'Bu kayıt üzerinde yetkin yok.';
  end if;

  if v_review.status <> 'pending' then
    return 'already_processed';
  end if;

  if p_action = 'approve' then
    v_credit := coalesce(p_seconds, v_review.seconds);
    if v_credit < 0 or v_credit > v_review.seconds then
      raise exception 'Geçersiz süre.';
    end if;

    update public.student_tasks
      set tracked_duration_seconds = least(86400, tracked_duration_seconds + v_credit),
          updated_at = now()
      where id = v_review.task_id;

    update public.focus_session_reviews
      set status = 'approved', approved_seconds = v_credit, reviewed_by = auth.uid(), reviewed_at = now()
      where id = v_review.id;
    return 'approved';
  end if;

  update public.focus_session_reviews
    set status = 'rejected', approved_seconds = 0, reviewed_by = auth.uid(), reviewed_at = now()
    where id = v_review.id;
  return 'rejected';
end;
$$;

revoke all on function public.review_focus_session(uuid, text, int) from public;
grant execute on function public.review_focus_session(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';

-- Verification: expect one row, rls_enabled = true, policy_count = 3.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'focus_session_reviews';
