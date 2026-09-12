// One-off admin utility: clears the brute-force lockout counter for a
// phone number. This is NOT profiles.is_active (a separate mechanism, a
// different message: "Bu hesap pasif durumda...") -- the lockout you're
// seeing ("Çok fazla hatalı deneme...") comes from public.login_failed_attempts
// (migration 0041), a table keyed by phone with zero RLS grants to
// anon/authenticated -- reachable only via the service-role client,
// exactly like clearFailedAttempts() in lib/login-lockout.ts (which this
// mirrors; that function isn't reusable here directly since it's a
// server-only TS module, not something a plain .mjs script can import).
//
// Same safety properties as the other scripts in this folder: run locally
// with your own service-role key, never called from the deployed app or
// from Claude, the key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/clear-login-lockout.mjs "+905432046683"

import { createClient } from "@supabase/supabase-js";

const [, , phone] = process.argv;

if (!phone) {
  console.error("Usage: node --env-file=<your-env-file> scripts/clear-login-lockout.mjs <phone>");
  console.error('Example: node --env-file=.env.production-admin.local scripts/clear-login-lockout.mjs "+905432046683"');
  process.exit(1);
}
if (!/^\+90\d{10}$/.test(phone)) {
  console.error(`Phone "${phone}" doesn't look like +90XXXXXXXXXX (must be +90 followed by exactly 10 digits). Refusing to proceed.`);
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

const { data: before } = await supabase
  .from("login_failed_attempts")
  .select("fail_count, locked_at")
  .eq("phone", phone)
  .maybeSingle();

if (!before) {
  console.log(`No lockout row found for ${phone} -- it isn't locked at the phone level. If you're still seeing the lockout message, it may be the separate per-IP throttle instead (self-expires after 15 minutes, no admin action needed).`);
  process.exit(0);
}

console.log(`Before: fail_count=${before.fail_count}, locked_at=${before.locked_at ?? "(not locked)"}`);

const { error } = await supabase.from("login_failed_attempts").delete().eq("phone", phone);
if (error) {
  console.error("Failed to clear lockout:", error.message);
  process.exit(1);
}

console.log(`Cleared. ${phone} can attempt to sign in again immediately.`);
