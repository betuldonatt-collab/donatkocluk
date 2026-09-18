-- Follow-up to 0082: filtering both rollups by status ('done'/'half_done')
-- wasn't quite enough. Live data turned up a real case that still broke
-- Toplam = Doğru+Yanlış+Boş: a "dual" task (a topic_study/video with a
-- question-count sub-target) can reach status = 'done' purely from its
-- manual "İzlendi/Tamamlandı" half, while the count half was never
-- touched -- total_count then still holds the coach's ORIGINAL TARGET
-- (never overwritten), while correct/wrong/empty stay null. That row
-- passes the status filter fine, so its stale target total kept leaking
-- into both rollups even after 0082.
--
-- Fix: stop reading the total_count column for the aggregate's own Toplam
-- entirely. Derive it as correct_count + wrong_count + empty_count summed
-- instead -- exactly what was asked for ("the exact Total based strictly
-- on the submitted Doğru/Yanlış/Boş input fields"). For every normally-
-- entered task this produces the identical number to before (those three
-- already have to add up to the total at entry time, enforced client- and
-- server-side) -- it only changes the dual-task-without-breakdown case
-- above, and only in the correct direction: a null D/Y/B row contributes
-- nothing, so its target never shows up as if it were real progress.

create or replace function public.recompute_student_daily_stats(p_entry_date date)
returns public.student_daily_stats
language sql
security definer
set search_path = public
volatile
as $$
  insert into public.student_daily_stats (student_id, entry_date, total_count, correct_count, wrong_count, empty_count)
  select
    auth.uid(),
    p_entry_date,
    coalesce(sum(correct_count), 0) + coalesce(sum(wrong_count), 0) + coalesce(sum(empty_count), 0),
    coalesce(sum(correct_count), 0),
    coalesce(sum(wrong_count), 0),
    coalesce(sum(empty_count), 0)
  from public.student_tasks
  where student_id = auth.uid()
    and task_date = p_entry_date
    and status in ('done', 'half_done')
  on conflict (student_id, entry_date) do update set
    total_count = excluded.total_count,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    empty_count = excluded.empty_count,
    updated_at = now()
  returning *;
$$;

create or replace function public.recompute_student_topic_stats(p_student_id uuid, p_course_id text, p_topic_id text)
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
    coalesce(sum(correct_count), 0) + coalesce(sum(wrong_count), 0) + coalesce(sum(empty_count), 0),
    coalesce(sum(correct_count), 0),
    coalesce(sum(wrong_count), 0),
    coalesce(sum(empty_count), 0)
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

-- Backfill both tables to the new derived formula. Same two-pass shape as
-- 0082's own backfill (a plain join would silently skip any bucket with
-- zero matching completed tasks, which needs to become 0, not be left
-- alone) -- Pass 2 re-zeros the same set 0082 already zeroed, harmless to
-- repeat, and keeps this migration correct standalone even if 0082's
-- backfill somehow hadn't fully run yet.

-- student_daily_stats, pass 1: dates with at least one done/half_done task.
update public.student_daily_stats sds
set
  total_count = agg.correct_count + agg.wrong_count + agg.empty_count,
  correct_count = agg.correct_count,
  wrong_count = agg.wrong_count,
  empty_count = agg.empty_count,
  updated_at = now()
from (
  select
    student_id,
    task_date as entry_date,
    coalesce(sum(correct_count), 0) as correct_count,
    coalesce(sum(wrong_count), 0) as wrong_count,
    coalesce(sum(empty_count), 0) as empty_count
  from public.student_tasks
  where status in ('done', 'half_done')
  group by student_id, task_date
) agg
where sds.student_id = agg.student_id and sds.entry_date = agg.entry_date;

-- student_daily_stats, pass 2: dates with no done/half_done task at all.
update public.student_daily_stats sds
set total_count = 0, correct_count = 0, wrong_count = 0, empty_count = 0, updated_at = now()
where (sds.total_count != 0 or sds.correct_count != 0 or sds.wrong_count != 0 or sds.empty_count != 0)
  and not exists (
    select 1 from public.student_tasks st
    where st.student_id = sds.student_id and st.task_date = sds.entry_date and st.status in ('done', 'half_done')
  );

-- student_topic_stats, pass 1: (student, course, topic) buckets with at
-- least one matching completed task -- same eligibility criteria
-- (total_count is not null, status, coach-vetted) as the function itself.
update public.student_topic_stats sts
set
  total_count = agg.correct_count + agg.wrong_count + agg.empty_count,
  correct_count = agg.correct_count,
  wrong_count = agg.wrong_count,
  empty_count = agg.empty_count,
  updated_at = now()
from (
  select
    student_id,
    course_id,
    coalesce(topic_id, 'karma') as topic_id,
    coalesce(sum(correct_count), 0) as correct_count,
    coalesce(sum(wrong_count), 0) as wrong_count,
    coalesce(sum(empty_count), 0) as empty_count
  from public.student_tasks
  where total_count is not null
    and status in ('done', 'half_done')
    and (is_coach_assigned or is_approved_by_coach)
  group by student_id, course_id, coalesce(topic_id, 'karma')
) agg
where sts.student_id = agg.student_id and sts.course_id = agg.course_id and sts.topic_id = agg.topic_id;

-- student_topic_stats, pass 2: buckets with no matching completed task at
-- all (a bucket only ever exists here because it was written by a past
-- recompute, so a now-empty one still needs zeroing, not deletion, to
-- match the function's own upsert-to-zero behavior).
update public.student_topic_stats sts
set total_count = 0, correct_count = 0, wrong_count = 0, empty_count = 0, updated_at = now()
where (sts.total_count != 0 or sts.correct_count != 0 or sts.wrong_count != 0 or sts.empty_count != 0)
  and not exists (
    select 1 from public.student_tasks st
    where st.student_id = sts.student_id
      and st.course_id = sts.course_id
      and coalesce(st.topic_id, 'karma') = sts.topic_id
      and st.total_count is not null
      and st.status in ('done', 'half_done')
      and (st.is_coach_assigned or st.is_approved_by_coach)
  );

notify pgrst, 'reload schema';
