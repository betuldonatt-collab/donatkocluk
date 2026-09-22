-- =============================================================================
-- Unify Paragraf/Problem data entry: a routine task (course_id 'paragraf' or
-- 'problem', assigned or self-created+approved) that the student completes on
-- their own task board now feeds the Paragraf ve Problem Çizelgesi
-- automatically -- no separate manual entry needed for the same session.
--
-- paragraf_problem_entries.source_task_id links a row back to the student_tasks
-- row it came from (null for a manually-typed entry, unaffected by any of this).
-- One synced row per task: sync_paragraf_problem_entry upserts it on the task's
-- own id whenever the task's counts/status change, and deletes it if the task
-- stops counting (marked not done/pending again, rejected, or moved off
-- paragraf/problem) or is deleted outright (on delete cascade). The manual entry
-- form is untouched -- a student who studies outside any assigned task still
-- logs it there, and both kinds of rows sit side by side in the same table and
-- chart.
-- Idempotent: safe to run more than once.
-- =============================================================================

alter table public.paragraf_problem_entries
  add column if not exists source_task_id uuid references public.student_tasks (id) on delete cascade;

-- One synced row per task (a manual entry's source_task_id is null, and a
-- unique index ignores nulls, so any number of manual entries are unaffected).
create unique index if not exists paragraf_problem_entries_source_task_idx
  on public.paragraf_problem_entries (source_task_id);

-- Re-derives (or removes) the ONE paragraf_problem_entries row tied to task
-- p_task_id, from that task's own current state -- called after any write that
-- could change whether/how it counts (see call sites in app/student/actions.ts
-- and app/coach/actions.ts). SECURITY DEFINER, like this app's other recompute
-- functions, but takes a task id rather than resolving auth.uid(): safe because
-- every field it writes is read straight off that task row, which the caller
-- could only have set to begin with through student_tasks' own RLS (this
-- function can only ever reproduce that row's already-authorized state, never
-- invent a different one) -- calling it for someone else's task id just
-- recomputes THEIR entry from THEIR own data, a harmless no-op in practice.
--
-- Only counts a task that is actually trustworthy history, same rule "Soft
-- Coach Approval" already applies elsewhere (Kaynak Takibi, Gelişim Haritası,
-- Karne): coach-assigned, or self-created and approved. And only once it's
-- genuinely done/half_done -- an untouched or explicitly-skipped task has
-- nothing to chart.
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
      entry_date = excluded.entry_date,
      problem_dogru = excluded.problem_dogru,
      problem_yanlis = excluded.problem_yanlis,
      problem_bos = excluded.problem_bos,
      problem_sure = excluded.problem_sure;
  end if;
end;
$$;

grant execute on function public.sync_paragraf_problem_entry(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verification. Expect: 1 row for the column; 1 row for the unique index.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'paragraf_problem_entries' and column_name = 'source_task_id';

select indexname from pg_indexes
where schemaname = 'public' and tablename = 'paragraf_problem_entries' and indexname = 'paragraf_problem_entries_source_task_idx';
