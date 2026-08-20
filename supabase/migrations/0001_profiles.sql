-- Shared role tag on every user, per project decision: one profiles table,
-- role stored as a column (enum) rather than separate per-role tables.
create type public.user_role as enum ('student', 'parent', 'coach', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- New tables are no longer auto-exposed to the Data API roles; grant access
-- explicitly so the RLS policies below actually get evaluated instead of
-- being blocked upfront by a permission-denied at the grant level.
grant select, update on public.profiles to authenticated;

-- A policy on profiles can't query profiles directly in its USING clause --
-- Postgres re-evaluates the same policy for that inner query, which
-- recurses forever (error 42P17). Routing the "is admin" check through a
-- security-definer function (owned by postgres, which has BYPASSRLS)
-- breaks the recursion: the function's internal select skips RLS entirely.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
  );

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Role is set at signup and must not be changeable by the user themselves;
-- only an admin (or the server, via service role) may reassign it.
create function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

-- Auto-provision a profile row when a new auth user signs up. The role is
-- read from the signup metadata (set by the client based on which panel
-- button the user chose on the login/signup screen).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student'),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
