-- student_resources was missing an admin bypass policy entirely -- every
-- sibling table in this cascade (task_resources, student_resource_progress)
-- already has one, but this one only ever got coach-scoped and
-- own-student policies (0013/0014/0018). Without this, an admin has no
-- RLS path to delete (or otherwise touch) a resource at all, contradicting
-- "permanent deletion rights are restricted to Coaches and Admins" -- as
-- written, admins were silently excluded from their own half of that rule.
create policy "student_resources_admin_all"
  on public.student_resources for all
  to authenticated
  using (is_admin())
  with check (is_admin());
