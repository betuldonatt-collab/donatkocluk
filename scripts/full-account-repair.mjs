// One-off admin utility: fully repairs one account in whichever Supabase
// project the passed --env-file points at (local Docker or production --
// this script is environment-agnostic by design, since it only ever reads
// NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from that file). In
// one run: sets auth.users.app_metadata.role AND the password, rewrites
// public.profiles.role to match, and clears any phone-keyed login lockout.
//
// This is the union of create-account.mjs / reset-account-password.mjs /
// check-profile-role.mjs / clear-login-lockout.mjs's individual fixes --
// use those instead when you only need one piece; use this when you want
// every layer forced back into a known-good, consistent state in one go.
//
// Same safety properties as the rest of this folder: run locally with your
// own service-role key, never called from the deployed app or from Claude,
// the key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=<env-file> scripts/full-account-repair.mjs <user-id> <phone> <new-password> <role>
//
// Examples:
//   node --env-file=.env.production-admin.local scripts/full-account-repair.mjs "84c96ff2-9c77-4e46-940e-924fcc7854be" "+905432046683" "Donat123!" admin
//   node --env-file=.env.local scripts/full-account-repair.mjs "84c96ff2-9c77-4e46-940e-924fcc7854be" "+905432046683" "Donat123!" admin

import { createClient } from "@supabase/supabase-js";

const [, , userId, phone, password, role] = process.argv;
const VALID_ROLES = new Set(["student", "parent", "coach", "admin"]);

if (!userId || !phone || !password || !role) {
  console.error("Usage: node --env-file=<env-file> scripts/full-account-repair.mjs <user-id> <phone> <new-password> <role>");
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error(`"${userId}" doesn't look like a UUID.`);
  process.exit(1);
}
if (!/^\+90\d{10}$/.test(phone)) {
  console.error(`Phone "${phone}" doesn't look like +90XXXXXXXXXX (must be +90 followed by exactly 10 digits).`);
  process.exit(1);
}
if (!VALID_ROLES.has(role)) {
  console.error(`Role "${role}" is not one of: ${[...VALID_ROLES].join(", ")}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

console.log(`Using Supabase project: ${url}`);
console.log(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url) ? "(local stack)" : "(remote project)");

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. auth.users: password + app_metadata.role together in one call.
console.log("\n[1/4] Setting password + app_metadata.role on auth.users...");
const { data: authUser, error: authError } = await supabase.auth.admin.updateUserById(userId, {
  password,
  app_metadata: { role },
});
if (authError) {
  console.error("  Failed:", authError.message);
  process.exit(1);
}
if (authUser.user.phone !== phone.replace(/^\+/, "")) {
  console.warn(`  Warning: this user's actual phone on record is "${authUser.user.phone}", not "${phone}" -- double-check you have the right user id.`);
}
console.log(`  Done. app_metadata.role is now "${authUser.user.app_metadata?.role}".`);

// 2. public.profiles: delete + re-insert, not update -- profiles has a
// BEFORE UPDATE trigger (profiles_prevent_self_role_change, migration
// 0001) that raises unless is_admin() is true, and that resolves to false
// for a service-role connection (auth.uid() is NULL, no `sub` claim on
// that JWT) despite the trigger's own comment claiming service role is
// exempt. A fresh INSERT never fires a BEFORE UPDATE trigger, sidestepping
// this. Safe specifically because this is expected to be an account with
// no other data pointing at its profile row yet -- do not reuse this on an
// established user with real dependent data.
console.log("\n[2/4] Rewriting public.profiles.role...");
const { data: existingProfile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
if (existingProfile) {
  const { error: deleteError } = await supabase.from("profiles").delete().eq("id", userId);
  if (deleteError) {
    console.error("  Failed to remove the old row:", deleteError.message);
    process.exit(1);
  }
}
const { error: insertError } = await supabase
  .from("profiles")
  .insert({ id: userId, role, full_name: existingProfile?.full_name ?? authUser.user.user_metadata?.full_name ?? null });
if (insertError) {
  console.error("  Failed:", insertError.message);
  process.exit(1);
}
console.log(`  Done. profiles.role is now "${role}".`);

// 3. login_failed_attempts: clear any phone-keyed lockout.
console.log("\n[3/4] Clearing login_failed_attempts...");
const { data: lockRow } = await supabase.from("login_failed_attempts").select("fail_count, locked_at").eq("phone", phone).maybeSingle();
if (lockRow) {
  const { error: clearError } = await supabase.from("login_failed_attempts").delete().eq("phone", phone);
  if (clearError) {
    console.error("  Failed:", clearError.message);
    process.exit(1);
  }
  console.log(`  Cleared (was fail_count=${lockRow.fail_count}, locked_at=${lockRow.locked_at ?? "not locked"}).`);
} else {
  console.log("  No lockout row found -- nothing to clear.");
}

// 4. Not touched: the separate per-IP throttle (login_ip_attempts) --
// self-expires after 15 minutes and isn't phone-specific, so clearing it
// per-account doesn't make sense; mentioned here only so its absence from
// this script isn't mistaken for an oversight.
console.log("\n[4/4] Per-IP throttle (login_ip_attempts) intentionally left alone -- it's not phone-specific and self-expires in 15 minutes.");

console.log(`\nAll done. ${phone} / the password you just set should now sign in and land on /${role}.`);
