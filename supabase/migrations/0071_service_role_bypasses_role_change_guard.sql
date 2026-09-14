-- prevent_self_role_change (0001) has always claimed, in its own comment,
-- that "only an admin (or the server, via service role) may reassign"
-- profiles.role -- but the actual check only ever tested is_admin(),
-- which resolves false for a service-role connection (auth.uid() is NULL,
-- there's no `sub` claim on that JWT). This was silently blocking any
-- service-role UPDATE that changes role, with no exemption ever actually
-- implemented for the case the comment describes.
--
-- This matters now specifically because approveSignupRequest
-- (app/admin/actions.ts) is being changed to explicitly set profiles.role
-- right after createUser() succeeds, as a guaranteed correction
-- independent of handle_new_user()'s own insert-time read of
-- app_metadata (which has been observed to occasionally not see the
-- role yet at the moment the AFTER INSERT trigger fires). That UPDATE
-- runs from the service-role client and WILL be blocked by this trigger
-- without this fix.
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role <> old.role and not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;
