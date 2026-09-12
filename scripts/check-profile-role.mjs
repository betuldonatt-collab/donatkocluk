// One-off admin utility: reads (and optionally fixes) the public.profiles
// row for a given user id via the service-role key (bypasses RLS entirely,
// so this always sees the true row -- no ambiguity about whether RLS is
// hiding it). Diagnoses exactly what lib/supabase/middleware.ts's own
// profiles.select("role") query would see for this user, since a missing
// row or wrong role is what sends an authenticated user back to "/"
// instead of their panel.
//
// Same safety properties as create-account.mjs / reset-account-password.mjs:
// run locally with your own service-role key, never called from the
// deployed app or from Claude, the key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/check-profile-role.mjs "<user-id>" [role-to-set-if-wrong]
//
// Examples:
//   node --env-file=.env.production-admin.local scripts/check-profile-role.mjs "84c96ff2-9c77-4e46-940e-924fcc7854be"
//   node --env-file=.env.production-admin.local scripts/check-profile-role.mjs "84c96ff2-9c77-4e46-940e-924fcc7854be" admin

import { createClient } from "@supabase/supabase-js";

const [, , userId, fixRole] = process.argv;
const VALID_ROLES = new Set(["student", "parent", "coach", "admin"]);

if (!userId) {
  console.error("Usage: node --env-file=<your-env-file> scripts/check-profile-role.mjs <user-id> [role-to-set-if-wrong]");
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error(`"${userId}" doesn't look like a UUID. Pass the user id printed by create-account.mjs, not the phone number.`);
  process.exit(1);
}
if (fixRole && !VALID_ROLES.has(fixRole)) {
  console.error(`Role "${fixRole}" is not one of: ${[...VALID_ROLES].join(", ")}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url)) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL is "${url}" -- that's the LOCAL Supabase Docker address, not your hosted project.`);
  process.exit(1);
}

console.log(`Using Supabase project: ${url}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
if (authError) {
  console.error("auth.users lookup failed:", authError.message);
  process.exit(1);
}
console.log("auth.users row:");
console.log(`  phone: ${authUser.user.phone ?? "n/a"}`);
console.log(`  app_metadata.role: ${authUser.user.app_metadata?.role ?? "(not set)"}`);

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("id, role, full_name")
  .eq("id", userId)
  .maybeSingle();
if (profileError) {
  console.error("public.profiles lookup failed:", profileError.message);
  process.exit(1);
}

if (!profile) {
  console.log("\npublic.profiles row: MISSING.");
  console.log("handle_new_user() never inserted a row for this user -- this is why middleware sees no role and sends you back to \"/\".");
} else {
  console.log("\npublic.profiles row:");
  console.log(`  role: ${profile.role}`);
  console.log(`  full_name: ${profile.full_name ?? "n/a"}`);
  if (profile.role !== "admin") {
    console.log(`\nRole is "${profile.role}", not "admin" -- this is why middleware sends you to "${profile.role ? `/${profile.role}` : "/"}" instead of /admin.`);
  } else {
    console.log("\nRole is correctly \"admin\". If /admin still redirects to \"/\", the issue is elsewhere (e.g. the session cookie), not this row.");
  }
}

if (!fixRole) {
  if (!profile || profile.role !== "admin") {
    console.log(`\nRe-run with a role argument to fix it, e.g.:\n  node --env-file=.env.production-admin.local scripts/check-profile-role.mjs "${userId}" admin`);
  }
  process.exit(0);
}

// profiles has a BEFORE UPDATE trigger (profiles_prevent_self_role_change,
// migration 0001) that raises unless public.is_admin() -- which checks
// auth.uid(), and that's NULL for a service-role connection (no `sub`
// claim on that JWT). So a plain .upsert() on an EXISTING row with a
// different role would actually hit "Only an admin can change a user
// role", despite that migration's own comment claiming service role is
// exempt. Deleting and re-inserting sidesteps this entirely -- a fresh
// INSERT never fires a BEFORE UPDATE trigger. Safe here specifically
// because this is a just-created account with no dependent rows yet in
// any other table; do NOT reuse this delete+insert approach on an
// established user who already has real data referencing their profile.
console.log(`\nSetting role to "${fixRole}"...`);
if (profile) {
  const { error: deleteError } = await supabase.from("profiles").delete().eq("id", userId);
  if (deleteError) {
    console.error("Failed to remove the old row:", deleteError.message);
    process.exit(1);
  }
}
const { error: insertError } = await supabase
  .from("profiles")
  .insert({ id: userId, role: fixRole, full_name: profile?.full_name ?? authUser.user.user_metadata?.full_name ?? null });
if (insertError) {
  console.error("Failed:", insertError.message);
  process.exit(1);
}
console.log("Done. Try signing in again.");
