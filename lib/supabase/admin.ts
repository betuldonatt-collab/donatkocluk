import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client -- bypasses RLS and can call auth.admin.* (e.g.
// updateUserById for the emergency manual password reset). Never import
// this from a client component; every caller must do its own is_admin()
// check first since RLS cannot protect an Auth-service call.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
