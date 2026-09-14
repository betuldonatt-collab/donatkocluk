-- Phase 2 of the historical-data performance plan: a lifetime-cumulative
-- rollup of student_tasks, one row per (student, course, topic), so the
-- coach student-detail page's Kaynak Takibi topic/karma breakdown reads a
-- small fixed-size table instead of aggregating every task a student has
-- ever had in JS on every page load. Mirrors student_daily_stats (0031)
-- and its security-definer recompute RPC (0057) exactly, one level up:
-- keyed by topic instead of day.
--
-- Unlike recompute_student_daily_stats, this RPC takes an explicit
-- p_student_id rather than always resolving auth.uid() internally --
-- coach-side writes (assign/approve/edit a student's task) must be able
-- to recompute a student's bucket even though the coach, not the
-- student, is the caller. Authorization is checked explicitly inside
-- (own row, admin, the student's coach, or a service-role connection for
-- the one-off backfill script) instead of relying on RLS, since this is
-- a security definer function that bypasses RLS by design. The
-- service-role bypass exists specifically because migration 0071 found a
-- real production bug from forgetting one on prevent_self_role_change --
-- auth.uid() resolves to NULL for a service-role connection, so omitting
-- it here would silently reject the backfill script with no useful error.

create table public.student_topic_stats (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  topic_id text not null, -- 'karma' folds in a null raw topic_id, same convention as every existing topic-stats read site
  total_count int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  empty_count int not null default 0,
  updated_at timestamptz not null default now()
);

create unique index student_topic_stats_unique_bucket
  on public.student_topic_stats (student_id, course_id, topic_id);

alter table public.student_topic_stats enable row level security;
grant select on public.student_topic_stats to authenticated;

-- No general write grant: this table is a derived cache, same as
-- student_daily_stats post-0057 -- the only legitimate write path is the
-- security-definer recompute function below, which validates who it's
-- writing on behalf of internally.

create policy "student_topic_stats_admin_all"
  on public.student_topic_stats for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "student_topic_stats_own_read"
  on public.student_topic_stats for select
  to authenticated
  using (student_id = (select auth.uid()));

create policy "student_topic_stats_coach_read"
  on public.student_topic_stats for select
  to authenticated
  using (exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = student_topic_stats.student_id
  ));

-- Recomputes exactly ONE (student, course, topic) bucket from scratch and
-- upserts it -- self-healing (call it again, it's correct, no drift can
-- accumulate), same idiom as recompute_student_daily_stats (0057). Scoped
-- to one topic rather than one day: still bounded and cheap in practice
-- (a curriculum topic accumulates tasks far slower than a student's whole
-- history does), without the correctness risk of a delta-based trigger.
--
-- Counting rule matches the audited fix already applied to
-- app/coach/students/[id]/page.tsx and app/student/kaynak-takibi/page.tsx
-- this session: a task only counts once it's genuinely done (status in
-- done/half_done) and coach-provenanced (assigned by the coach, or a
-- student's own entry the coach has approved) -- a coach's assigned-but-
-- untouched PLAN, or a student's still-pending self-log, must never be
-- counted as solved.
create function public.recompute_student_topic_stats(p_student_id uuid, p_course_id text, p_topic_id text)
returns public.student_topic_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.student_topic_stats;
begin
  if not (
    p_student_id = (select auth.uid())
    or public.is_admin()
    or auth.role() = 'service_role'
    or exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = p_student_id
    )
  ) then
    raise exception 'Not authorized to recompute topic stats for this student.';
  end if;

  insert into public.student_topic_stats (student_id, course_id, topic_id, total_count, correct_count, wrong_count, empty_count)
  select
    p_student_id, p_course_id, p_topic_id,
    coalesce(sum(total_count), 0), coalesce(sum(correct_count), 0),
    coalesce(sum(wrong_count), 0), coalesce(sum(empty_count), 0)
  from public.student_tasks
  where student_id = p_student_id
    and course_id = p_course_id
    and coalesce(topic_id, 'karma') = p_topic_id
    and total_count is not null
    and status in ('done', 'half_done')
    and (is_coach_assigned or is_approved_by_coach)
  on conflict (student_id, course_id, topic_id) do update set
    total_count = excluded.total_count,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    empty_count = excluded.empty_count,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.recompute_student_topic_stats(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
