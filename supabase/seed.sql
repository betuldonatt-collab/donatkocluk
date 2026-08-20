-- Local-only test accounts, recreated automatically by every
-- `supabase db reset` / `supabase start`. Never runs against a real
-- (non-local) database — this file is only picked up by the local CLI.
--
-- Admin: admin@local.dev / LocalAdmin123!
do $$
declare
  admin_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email = 'admin@local.dev') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      admin_id,
      'authenticated',
      'authenticated',
      'admin@local.dev',
      crypt('LocalAdmin123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"admin","full_name":"Local Test Admin"}',
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      admin_id,
      admin_id::text,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@local.dev'),
      'email',
      now(), now(), now()
    );
    -- public.profiles row is created automatically by the
    -- on_auth_user_created trigger (see 0001_profiles.sql).
  end if;
end $$;
