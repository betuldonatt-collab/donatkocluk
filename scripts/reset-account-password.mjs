// One-off admin utility: force-sets the password on an EXISTING phone-auth
// account via the Supabase Admin API (auth.admin.updateUserById), the
// companion to create-account.mjs for when the account already exists and
// you just need to (re)set a known-good password -- e.g. after an earlier
// creation where the actual password ended up uncertain.
//
// Same safety properties as create-account.mjs: run locally with your own
// service-role key, never called from the deployed app or from Claude, the
// key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/reset-account-password.mjs "<user-id>" "<new-password>"
//
// Example:
//   node --env-file=.env.production-admin.local scripts/reset-account-password.mjs "84c96ff2-9c77-4e46-940e-924fcc7854be" "Donat123!"

import { createClient } from "@supabase/supabase-js";

const [, , userId, password] = process.argv;

if (!userId || !password) {
  console.error("Usage: node --env-file=<your-env-file> scripts/reset-account-password.mjs <user-id> <new-password>");
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error(`"${userId}" doesn't look like a UUID. Pass the user id printed by create-account.mjs, not the phone number.`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Make sure you ran this with: node --env-file=<your-env-file> scripts/reset-account-password.mjs ...");
  process.exit(1);
}

if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url)) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL is "${url}" -- that's the LOCAL Supabase Docker address, not your hosted project.`);
  process.exit(1);
}

console.log(`Using Supabase project: ${url}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let result;
try {
  result = await supabase.auth.admin.updateUserById(userId, { password });
} catch (e) {
  console.error("Request itself threw (not a Supabase API error):", e);
  if (e?.cause) console.error("Underlying cause:", e.cause);
  process.exit(1);
}

const { data, error } = result;
if (error) {
  console.error("Failed:", error.message);
  if (error.cause) console.error("Underlying cause:", error.cause);
  process.exit(1);
}

console.log(`Password reset for user ${data.user.id} (phone: ${data.user.phone ?? "n/a"}). Try signing in now.`);
