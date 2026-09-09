-- Distinguishes inventory-tracked branch-trial resources from ordinary
-- study resources (which use student_resource_progress's per-topic
-- solved/reviewed checklist instead -- a branch trial has no topic).
create type public.student_resource_kind as enum ('study', 'branch_exam');
alter table public.student_resources
  add column kind public.student_resource_kind not null default 'study',
  add column total_stock int,
  add column remaining_stock int;

-- Students already have a blanket own-row UPDATE grant
-- (student_resources_own_update, 0018) -- without this guard a student
-- could PATCH kind/total_stock/remaining_stock directly. The deduction
-- trigger below (the system's own automatic write) needs to bypass this
-- same guard, via a transaction-local flag -- the standard Postgres
-- pattern for "trusted internal cascade, skip the guard."
create or replace function public.prevent_student_resource_stock_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if current_setting('app.bypass_stock_guard', true) = 'on' then
    return new;
  end if;
  if not public.is_admin()
    and not exists (
      select 1 from public.coach_students cs
      where cs.coach_id = (select auth.uid()) and cs.student_id = old.student_id
    )
  then
    if new.kind is distinct from old.kind
      or new.total_stock is distinct from old.total_stock
      or new.remaining_stock is distinct from old.remaining_stock
    then
      raise exception 'Stok bilgisi sadece koç tarafından değiştirilebilir.';
    end if;
  end if;
  return new;
end;
$$;
create trigger student_resources_prevent_stock_tampering
  before update on public.student_resources
  for each row execute function public.prevent_student_resource_stock_tampering();

-- Deducts/restocks on a branch_exam task's status transition into/out of
-- 'done', regardless of which action changed it (the student's own
-- updateTaskProgress or the coach's updateAssignedTaskStatus -- neither
-- needs code changes for this to work). total_count on the task is
-- reused as the "Kaç Adet" quantity. Clamped at 0 so over-assignment
-- past available stock can't show a negative remaining count.
create or replace function public.apply_branch_exam_stock_delta()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  qty int;
begin
  if new.task_type <> 'branch_exam' or old.status = new.status then
    return new;
  end if;
  qty := coalesce(new.total_count, 0);
  if qty <= 0 then
    return new;
  end if;

  perform set_config('app.bypass_stock_guard', 'on', true);

  if new.status = 'done' then
    for r in select resource_id from public.task_resources where task_id = new.id loop
      update public.student_resources
        set remaining_stock = greatest(0, coalesce(remaining_stock, 0) - qty)
        where id = r.resource_id and kind = 'branch_exam';
    end loop;
  elsif old.status = 'done' then
    for r in select resource_id from public.task_resources where task_id = new.id loop
      update public.student_resources
        set remaining_stock = coalesce(remaining_stock, 0) + qty
        where id = r.resource_id and kind = 'branch_exam';
    end loop;
  end if;

  perform set_config('app.bypass_stock_guard', 'off', true);
  return new;
end;
$$;
create trigger student_tasks_branch_exam_stock
  after update on public.student_tasks
  for each row execute function public.apply_branch_exam_stock_delta();

notify pgrst, 'reload schema';
