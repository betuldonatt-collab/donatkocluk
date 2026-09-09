-- Lets a student edit total_stock/remaining_stock on their OWN branch-trial
-- resources (explicit product decision -- self-managed inventory counts).
-- kind stays coach/admin-only regardless of row ownership, since a student
-- reclassifying a resource's kind would let them escape stock tracking
-- entirely. RLS's student_resources_own_update (0018) already grants the
-- student row-level UPDATE access; only this guard trigger (0044) needed
-- to relax.
create or replace function public.prevent_student_resource_stock_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_privileged boolean;
begin
  if current_setting('app.bypass_stock_guard', true) = 'on' then
    return new;
  end if;

  is_privileged := public.is_admin() or exists (
    select 1 from public.coach_students cs
    where cs.coach_id = (select auth.uid()) and cs.student_id = old.student_id
  );

  if not is_privileged and new.kind is distinct from old.kind then
    raise exception 'Kaynak türü değiştirilemez.';
  end if;

  if not is_privileged
    and old.student_id is distinct from (select auth.uid())
    and (new.total_stock is distinct from old.total_stock or new.remaining_stock is distinct from old.remaining_stock)
  then
    raise exception 'Stok bilgisi sadece koç tarafından değiştirilebilir.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
