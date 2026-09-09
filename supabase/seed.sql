-- Local-only test accounts, recreated automatically by every
-- `supabase db reset` / `supabase start`. Never runs against a real
-- (non-local) database — this file is only picked up by the local CLI.
--
-- Admin: admin@local.dev / LocalAdmin123!
-- Coach: coach@local.dev / LocalCoach123!
-- Parent: parent@local.dev / ParentTest2026!
create or replace function pg_temp.create_local_test_user(
  p_email text, p_password text, p_role text, p_full_name text
) returns uuid
language plpgsql
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = p_email) then
    return (select id from auth.users where email = p_email);
  end if;

  -- role lives in raw_app_meta_data, not raw_user_meta_data -- handle_new_user()
  -- (0062) only trusts the former (the public signUp() client can never set
  -- it, only the service-role Admin API), so a locally-seeded test account
  -- needs it there too or it silently ends up 'student' regardless of p_role.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', p_role),
    jsonb_build_object('full_name', p_full_name),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_id,
    new_id::text,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email',
    now(), now(), now()
  );
  -- public.profiles row is created automatically by the
  -- on_auth_user_created trigger (see 0001_profiles.sql).

  return new_id;
end;
$$;

select pg_temp.create_local_test_user('admin@local.dev', 'LocalAdmin123!', 'admin', 'Local Test Admin');
select pg_temp.create_local_test_user('coach@local.dev', 'LocalCoach123!', 'coach', 'Local Test Coach');
select pg_temp.create_local_test_user('parent@local.dev', 'ParentTest2026!', 'parent', 'Local Test Parent');
