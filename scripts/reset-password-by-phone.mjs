// One-off admin utility: force-sets a user's password by PHONE NUMBER, for
// when you're locked out and don't have the user id handy (the companion to
// reset-account-password.mjs, which takes a user id).
//
// Looks the user up by paging through auth.admin.listUsers() and matching the
// normalized phone (never trusts profiles.phone, which may or may not be kept
// in sync) -- robust regardless of how the number is stored, then calls
// auth.admin.updateUserById() with the new password.
//
// Same safety properties as every other script in this folder: run LOCALLY
// with your own service-role key, never called from the deployed app or from
// Claude -- the key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/reset-password-by-phone.mjs "<phone>" "<new-password>"
//
// Example:
//   node --env-file=.env.production-admin.local scripts/reset-password-by-phone.mjs "05432046683" "admin123"
//
// After logging in with the new password, change it again from Ayarlar >
// Şifre Değiştir -- "admin123" is fine to regain access, not to keep.

import { createClient } from "@supabase/supabase-js";

const [, , phoneRaw, password] = process.argv;

if (!phoneRaw || !password) {
  console.error("Usage: node --env-file=<your-env-file> scripts/reset-password-by-phone.mjs <phone> <new-password>");
  process.exit(1);
}

// Mirrors lib/phone.ts's normalizeTurkishPhone exactly.
function normalizeTurkishPhone(raw) {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("5")) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("05")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("905")) return `+${digits}`;
  return null;
}

const normalized = normalizeTurkishPhone(phoneRaw);
if (!normalized) {
  console.error(`"${phoneRaw}" doesn't look like a Turkish mobile number (expected 05XX XXX XX XX).`);
  process.exit(1);
}
const digitsOnly = normalized.slice(1); // GoTrue stores phone without the "+"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Make sure you ran this with: node --env-file=<your-env-file> scripts/reset-password-by-phone.mjs ...");
  process.exit(1);
}
if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url)) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL is "${url}" -- that's the LOCAL Supabase Docker address, not your hosted project.`);
  process.exit(1);
}

console.log(`Using Supabase project: ${url}`);
console.log(`Looking for phone: ${normalized}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let found = null;
for (let page = 1; page <= 50 && !found; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  found = data.users.find((u) => (u.phone ?? "").replace(/[^\d]/g, "") === digitsOnly);
  if (data.users.length < 1000) break; // last page
}

if (!found) {
  console.error(`No account found with phone ${normalized}. Double-check the number, or that the account exists at all.`);
  process.exit(1);
}

console.log(`Found user ${found.id} (role: ${found.app_metadata?.role ?? "unknown"}). Setting new password...`);

const { data, error } = await supabase.auth.admin.updateUserById(found.id, { password });
if (error) {
  console.error("Failed:", error.message);
  if (error.cause) console.error("Underlying cause:", error.cause);
  process.exit(1);
}

console.log(`Password reset for user ${data.user.id} (phone: ${data.user.phone ?? "n/a"}). Try signing in now.`);
console.log("Once you're back in, change this password from Ayarlar > Şifre Değiştir.");
