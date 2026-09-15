-- Robust, resumable, cross-device Focus Timer sessions.
--
-- Part 1: tracked_duration_minutes becomes a generated column over a new
-- second-granularity tracked_duration_seconds. The old column was written
-- once per session with a "round up to at least 1 minute" rule -- fine for
-- a single end-of-session save, but this feature now needs to bank partial
-- sessions (pause/resume, staleness cleanup) without ever compounding that
-- rounding into real inflation. Every existing reader (task-card badge,
-- get_daily_stopwatch_ranking below, fetchStopwatchCompetitionRoster in
-- app/coach/actions.ts) keeps working unchanged since the column still
-- exists and still holds whole minutes -- only its write path is gone.
alter table public.student_tasks add column tracked_duration_seconds int not null default 0;
update public.student_tasks set tracked_duration_seconds = tracked_duration_minutes * 60;

alter table public.student_tasks drop column tracked_duration_minutes;
alter table public.student_tasks add column tracked_duration_minutes int
  generated always as (tracked_duration_seconds / 60) stored;

-- Part 2: the live/paused/resumable session itself. One row per
-- (student, task) -- created on Başlat, updated on every pause/resume/
-- heartbeat, and deleted the moment it's banked into tracked_duration_seconds
-- (Bitir, Vazgeç, or end_focus_session's own staleness sweep below).
--
-- run_started_at is a timestamp, not a periodically-incremented counter --
-- any device can reconstruct "elapsed so far" as
-- accumulated_seconds + (now - run_started_at) just by reading this row, no
-- polling required. last_heartbeat_at is the trust boundary: reconciling a
-- dangling "running" row (a crash, or a different device picking it up)
-- always banks through last_heartbeat_at, never through "now" -- otherwise
-- a crashed tab would silently credit however long it sat dead.
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.student_tasks(id) on delete cascade,
  mode text not null check (mode in ('stopwatch', 'countdown')),
  countdown_target_seconds int,
  status text not null check (status in ('running', 'paused')),
  run_started_at timestamptz,
  accumulated_seconds int not null default 0,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (student_id, task_id)
);

alter table public.focus_sessions enable row level security;
grant select, insert, update, delete on public.focus_sessions to authenticated;

create policy "focus_sessions_student_own" on public.focus_sessions
  for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- Banks a session's elapsed time into tracked_duration_seconds and deletes
-- the row, in one transaction -- shared by Bitir, Vazgeç, and a stale-row
-- cleanup (getActiveFocusSession/startFocusSession, app/student/actions.ts).
-- p_bank_through is the trust boundary described above: now() for a live,
-- in-the-moment end; last_heartbeat_at for a stale row nobody's actively
-- running anymore. The explicit "and student_id = auth.uid()" on the
-- student_tasks UPDATE is what keeps a focus_sessions row that (somehow)
-- points at someone else's task from ever crediting that student's ledger --
-- it just updates 0 rows instead.
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

  update public.student_tasks
    set tracked_duration_seconds = least(86400, tracked_duration_seconds + v_seconds),
        updated_at = now()
    where id = p_task_id and student_id = auth.uid()
    returning tracked_duration_seconds into v_new_total;

  delete from public.focus_sessions where id = v_session.id;

  return v_new_total;
end;
$$;

grant execute on function public.end_focus_session(uuid, timestamptz) to authenticated;

-- Supersedes 0074's version: same shape, only the summed column changes
-- (tracked_duration_minutes -> tracked_duration_seconds / 60) now that the
-- former is generated rather than a real column function bodies can still
-- reference by name, but recomputing directly off seconds keeps this
-- function's own rounding independent of the generated column's.
create or replace function public.get_daily_stopwatch_ranking()
returns table (
  my_rank int,
  my_total_minutes int,
  top_student_name text,
  top_student_total_minutes int,
  participant_count int
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select p.competition_group_id
    from public.profiles p
    where p.id = auth.uid()
  ),
  totals as (
    select
      cs.student_id,
      p.full_name,
      (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from public.coach_students cs
    join public.profiles p on p.id = cs.student_id
    left join public.student_tasks st
      on st.student_id = cs.student_id and st.task_date = (now() at time zone 'utc')::date
    where cs.coach_id = (select coach_id from public.coach_students where student_id = auth.uid())
      and p.competition_status = 'active'
      and p.competition_group_id is not distinct from (select competition_group_id from me)
    group by cs.student_id, p.full_name
  ),
  ranked as (
    select student_id, full_name, total_minutes, rank() over (order by total_minutes desc) as rnk
    from totals
  ),
  my_total as (
    select (coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int as total_minutes
    from public.student_tasks st
    where st.student_id = auth.uid() and st.task_date = (now() at time zone 'utc')::date
  )
  select
    (select rnk from ranked where student_id = auth.uid()),
    (select total_minutes from my_total),
    (select full_name from ranked order by rnk asc limit 1),
    (select total_minutes from ranked order by rnk asc limit 1),
    (select count(*)::int from ranked);
$$;

grant execute on function public.get_daily_stopwatch_ranking() to authenticated;

notify pgrst, 'reload schema';
