-- =============================================================================
-- Same unification as migration 0091, for LGS: a "paragraf" or "kitap-okuma"
-- (Kitap Okuma) routine task's own counts now feed the LGS Paragraf/Kitap Okuma
-- tracker (lgs_daily_routines) directly -- no separate manual re-entry for the
-- same session.
--
-- lgs_daily_routines is one row per (student, day) with Paragraf and Kitap
-- Okuma as two independent HALVES of that row (see migration 0085's own
-- comment) -- unlike paragraf_problem_entries (0091), which is one row per
-- SESSION. The manual save already treats each half as "replace this day's
-- Paragraf/Kitap Okuma with what I just entered," not "add another session" (a
-- second manual Paragraf save for a day overwrites the first, by original
-- design). The task-driven sync below follows that exact same rule: a
-- Paragraf/Kitap Okuma routine task's current state REPLACES that day's half,
-- whichever source (a task, or the manual form) touches it last. Two new
-- marker columns (paragraf_source_task_id / kitap_source_task_id) record which
-- task a half currently came from, if any, purely so the sync can find and
-- clear ITS OWN half again later (task reset, rejected, moved to a different
-- course/day, or deleted) without touching a half a manual entry or a
-- different task owns.
-- Idempotent: safe to run more than once.
-- =============================================================================

alter table public.lgs_daily_routines
  add column if not exists paragraf_source_task_id uuid references public.student_tasks (id) on delete set null;
alter table public.lgs_daily_routines
  add column if not exists kitap_source_task_id uuid references public.student_tasks (id) on delete set null;

create index if not exists lgs_daily_routines_paragraf_source_idx
  on public.lgs_daily_routines (paragraf_source_task_id) where paragraf_source_task_id is not null;
create index if not exists lgs_daily_routines_kitap_source_idx
  on public.lgs_daily_routines (kitap_source_task_id) where kitap_source_task_id is not null;

-- The source task was hard-deleted (student_tasks' own FK just nulled the
-- marker column via ON DELETE SET NULL above) -- the half it owned must go
-- with it, or the row would keep showing that task's last-known numbers
-- forever. Fires only on the marker's OWN transition to null, so touching
-- anything else on the row (the other half, book_title from a fresh manual
-- save, ...) never trips it.
create or replace function public.clear_lgs_routine_half_on_task_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paragraf_source_task_id is null and old.paragraf_source_task_id is not null then
    new.paragraf_correct := 0;
    new.paragraf_wrong := 0;
    new.paragraf_empty := 0;
    new.paragraf_duration_minutes := null;
  end if;
  if new.kitap_source_task_id is null and old.kitap_source_task_id is not null then
    new.book_pages_read := null;
    new.book_title := null;
    new.book_author := null;
  end if;
  return new;
end;
$$;

drop trigger if exists lgs_routine_clear_on_task_delete on public.lgs_daily_routines;
create trigger lgs_routine_clear_on_task_delete
  before update of paragraf_source_task_id, kitap_source_task_id on public.lgs_daily_routines
  for each row execute function public.clear_lgs_routine_half_on_task_delete();

-- Re-derives (or removes) the ONE half of a day's row that task p_task_id
-- owns, from that task's own current state -- same call-site-driven,
-- SECURITY DEFINER idiom as sync_paragraf_problem_entry (0091); see that
-- migration's own comment for why taking a task id rather than resolving
-- auth.uid() is safe here too. Only a coach-assigned or approved, done/
-- half_done task counts, same "trustworthy history" rule as everywhere else.
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
  -- Wherever this task's marker currently sits (possibly a DIFFERENT day than
  -- its current task_date, if it was moved) -- cleared unconditionally before
  -- anything else, so a task that stops counting, changes course, or moves to
  -- a new day never leaves its old half behind.
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

  -- 'paragraf' is a course_id BOTH cohorts use (YKS has its own Paragraf
  -- routine too, tracked in paragraf_problem_entries instead, see 0091) --
  -- only ever write here for an actual LGS student, so a YKS student's
  -- Paragraf task never creates a stray lgs_daily_routines row for them.
  if not exists (select 1 from public.profiles where id = t.student_id and exam_type = 'LGS') then
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
    -- Kitap Okuma has no Yanlış/Boş -- the task's "Okunan Sayfa" (pages
    -- actually read) is correct_count, same column the task modal itself
    -- writes to (see showReadingProgress in task-modal.tsx). No Yazar field
    -- exists on a task at all, so book_author is deliberately left out of
    -- both the insert and the conflict update below -- a manually-typed
    -- author is never overwritten by a task syncing its page count.
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

-- Patches sync_paragraf_problem_entry (0091) with the mirror image of the same
-- guard: 'paragraf' is shared with LGS (see above), so that function must skip
-- an LGS student's task now that this migration gives LGS its own sync path --
-- otherwise an LGS student's Paragraf task would write into BOTH trackers.
-- Identical to 0091's version except for the added exam_type check.
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

  if exists (select 1 from public.profiles where id = t.student_id and exam_type = 'LGS') then
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

notify pgrst, 'reload schema';

-- Verification. Expect: 2 rows for the columns; true for the trigger existing.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'lgs_daily_routines'
  and column_name in ('paragraf_source_task_id', 'kitap_source_task_id')
order by column_name;

select exists (
  select 1 from pg_trigger where tgname = 'lgs_routine_clear_on_task_delete'
) as trigger_installed;
