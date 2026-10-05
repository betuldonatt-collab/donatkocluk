-- 7th grade: Paragraf / Kitap Okuma instead of Paragraf / Problem.
--
-- The 7th grade follows the LGS structure for the daily routines: Paragraf (3 yanlış 1 doğruyu götürür) and Kitap
-- Okuma (pages read), tracked in lgs_daily_routines -- no Problem. A 7th grader is a 'YKS' exam_type row with
-- profiles.is_maarif7 (0119), so the two task-sync functions, which decide the tracker by exam_type, need to know:
--   * sync_lgs_daily_routine_entry (0092): a 'paragraf' / 'kitap-okuma' routine task now also feeds
--     lgs_daily_routines for a 7th grader (before: only for exam_type = 'LGS');
--   * sync_paragraf_problem_entry (0092): skips a 7th grader's tasks (so they never write into BOTH trackers),
--     exactly as it already skips an LGS student's.
-- Both functions are otherwise IDENTICAL to their 0092 definitions. lgs_daily_routines' RLS (0085) is
-- "student_id = auth.uid()", it never looked at the cohort, so no policy change is needed.
--
-- Existing data: a 7th grader's earlier task-driven rows in paragraf_problem_entries are left where they are (the
-- tracker no longer shows them); their done 'paragraf' / 'kitap-okuma' routine tasks are copied into
-- lgs_daily_routines by the backfill at the end, so the new tracker starts with that history. Manual
-- Paragraf/Problem entries made on the old page stay in paragraf_problem_entries.
--
-- Idempotent: safe to run more than once.
--
-- Rollback: re-run the function definitions of migration 0092 (they check exam_type only).

create or replace function public.sync_lgs_daily_routine_entry(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_old_paragraf record;
  v_old_kitap record;
begin
  select entry_date into v_old_paragraf from public.lgs_daily_routines where paragraf_source_task_id = p_task_id;
  if found then
    update public.lgs_daily_routines set paragraf_source_task_id = null where entry_date = v_old_paragraf.entry_date and paragraf_source_task_id = p_task_id;
  end if;
  select entry_date into v_old_kitap from public.lgs_daily_routines where kitap_source_task_id = p_task_id;
  if found then
    update public.lgs_daily_routines set kitap_source_task_id = null where entry_date = v_old_kitap.entry_date and kitap_source_task_id = p_task_id;
  end if;

  select student_id, task_date, course_id, status, is_coach_assigned, is_approved_by_coach,
         correct_count, wrong_count, empty_count, duration_minutes, title
    into t
    from public.student_tasks
    where id = p_task_id;

  if not found or t.course_id not in ('paragraf', 'kitap-okuma') or t.status not in ('done', 'half_done')
     or not (t.is_coach_assigned or t.is_approved_by_coach)
  then
    return;
  end if;

  -- 'paragraf' is a course_id every cohort uses; only an LGS student or a 7th grader keeps this tracker.
  if not exists (
    select 1 from public.profiles where id = t.student_id and (exam_type = 'LGS' or is_maarif7)
  ) then
    return;
  end if;

  if t.course_id = 'paragraf' then
    insert into public.lgs_daily_routines (student_id, entry_date, paragraf_source_task_id, paragraf_correct, paragraf_wrong, paragraf_empty, paragraf_duration_minutes)
    values (t.student_id, t.task_date, p_task_id, coalesce(t.correct_count, 0), coalesce(t.wrong_count, 0), coalesce(t.empty_count, 0), t.duration_minutes)
    on conflict (student_id, entry_date) do update set
      paragraf_source_task_id = p_task_id,
      paragraf_correct = excluded.paragraf_correct,
      paragraf_wrong = excluded.paragraf_wrong,
      paragraf_empty = excluded.paragraf_empty,
      paragraf_duration_minutes = excluded.paragraf_duration_minutes,
      updated_at = now();
  else
    insert into public.lgs_daily_routines (student_id, entry_date, kitap_source_task_id, book_pages_read, book_title)
    values (t.student_id, t.task_date, p_task_id, coalesce(t.correct_count, 0), nullif(btrim(t.title), ''))
    on conflict (student_id, entry_date) do update set
      kitap_source_task_id = p_task_id,
      book_pages_read = excluded.book_pages_read,
      book_title = excluded.book_title,
      updated_at = now();
  end if;
end;
$$;

grant execute on function public.sync_lgs_daily_routine_entry(uuid) to authenticated;

create or replace function public.sync_paragraf_problem_entry(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select student_id, task_date, course_id, status, is_coach_assigned, is_approved_by_coach,
         correct_count, wrong_count, empty_count, duration_minutes
    into t
    from public.student_tasks
    where id = p_task_id;

  if not found or t.course_id not in ('paragraf', 'problem') or t.status not in ('done', 'half_done')
     or not (t.is_coach_assigned or t.is_approved_by_coach)
  then
    delete from public.paragraf_problem_entries where source_task_id = p_task_id;
    return;
  end if;

  -- An LGS student or a 7th grader tracks Paragraf / Kitap Okuma in lgs_daily_routines instead.
  if exists (select 1 from public.profiles where id = t.student_id and (exam_type = 'LGS' or is_maarif7)) then
    delete from public.paragraf_problem_entries where source_task_id = p_task_id;
    return;
  end if;

  if t.course_id = 'paragraf' then
    insert into public.paragraf_problem_entries
      (student_id, entry_date, source_task_id, paragraf_dogru, paragraf_yanlis, paragraf_bos, paragraf_sure)
    values
      (t.student_id, t.task_date, p_task_id, coalesce(t.correct_count, 0), coalesce(t.wrong_count, 0), coalesce(t.empty_count, 0), coalesce(t.duration_minutes, 0))
    on conflict (source_task_id) do update set
      entry_date = excluded.entry_date,
      paragraf_dogru = excluded.paragraf_dogru,
      paragraf_yanlis = excluded.paragraf_yanlis,
      paragraf_bos = excluded.paragraf_bos,
      paragraf_sure = excluded.paragraf_sure;
  else
    insert into public.paragraf_problem_entries
      (student_id, entry_date, source_task_id, problem_dogru, problem_yanlis, problem_bos, problem_sure)
    values
      (t.student_id, t.task_date, p_task_id, coalesce(t.correct_count, 0), coalesce(t.wrong_count, 0), coalesce(t.empty_count, 0), coalesce(t.duration_minutes, 0))
    on conflict (source_task_id) do update set
      problem_dogru = excluded.problem_dogru,
      problem_yanlis = excluded.problem_yanlis,
      problem_bos = excluded.problem_bos,
      problem_sure = excluded.problem_sure;
  end if;
end;
$$;

-- Backfill: copy every 7th grader's existing done Paragraf / Kitap Okuma routine tasks into the new tracker
-- (oldest first, so the newest task of a day wins, as it does when they sync live).
select public.sync_lgs_daily_routine_entry(t.id)
from public.student_tasks t
join public.profiles p on p.id = t.student_id
where p.is_maarif7
  and t.course_id in ('paragraf', 'kitap-okuma')
  and t.status in ('done', 'half_done')
order by t.task_date asc, t.updated_at asc;

notify pgrst, 'reload schema';

-- Verification (run after applying):
--   select count(*) from public.lgs_daily_routines r join public.profiles p on p.id = r.student_id where p.is_maarif7;
--   -- = the number of days a 7th grader has a done Paragraf / Kitap Okuma routine task on (0 if none yet)
