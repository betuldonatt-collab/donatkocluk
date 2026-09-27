// One-off admin utility: fixes a WRONG login phone number on an already
// approved account (the number typed into the signup request, later baked
// into auth.users.phone when it was approved). Changes it IN PLACE via
// auth.admin.updateUserById -- the user's id, and everything keyed by it
// (their public.profiles row, coach_students / parent_students links, every
// task/session/report they own), is completely untouched. This is the right
// tool for that job -- NOT delete-misassigned-account.mjs + create-account.mjs,
// which would assign a brand-new id and orphan/require re-linking all of it.
//
// Does NOT touch:
//   - public.profiles.phone / public.coach_profiles.phone -- separate CONTACT
//     info fields (shown on Parent/Coach "Ayarlar" > Telefon), not the login
//     credential. Fix those the normal way (that settings field) if the same
//     typo landed there too.
//   - login_failed_attempts / password_reset_requests rows keyed by the OLD
//     phone -- harmless leftovers, they just won't match anything going
//     forward (login_failed_attempts self-expires in 30 min regardless).
//
// Same safety properties as the other scripts in this folder: run locally
// with your own service-role key, never called from the deployed app or
// from Claude -- the key never leaves your machine.
//
// Usage (run from the project root, phones in any common format):
//   node --env-file=.env.production-admin.local scripts/change-login-phone.mjs "<wrong-phone>" "<correct-phone>"
//
// Example:
//   node --env-file=.env.production-admin.local scripts/change-login-phone.mjs "05321234567" "05329876543"

import { createClient } from "@supabase/supabase-js";

const [, , oldPhoneRaw, newPhoneRaw] = process.argv;

if (!oldPhoneRaw || !newPhoneRaw) {
  console.error("Usage: node --env-file=<your-env-file> scripts/change-login-phone.mjs <wrong-phone> <correct-phone>");
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

const oldPhone = normalizeTurkishPhone(oldPhoneRaw);
const newPhone = normalizeTurkishPhone(newPhoneRaw);
if (!oldPhone) {
  console.error(`"${oldPhoneRaw}" doesn't look like a Turkish mobile number (expected 05XX XXX XX XX).`);
  process.exit(1);
}
if (!newPhone) {
  console.error(`"${newPhoneRaw}" doesn't look like a Turkish mobile number (expected 05XX XXX XX XX).`);
  process.exit(1);
}
if (oldPhone === newPhone) {
  console.error("The old and new phone numbers normalize to the same thing -- nothing to change.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Make sure you ran this with: node --env-file=<your-env-file> scripts/change-login-phone.mjs ...");
  process.exit(1);
}
if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url)) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL is "${url}" -- that's the LOCAL Supabase Docker address, not your hosted project.`);
  process.exit(1);
}

console.log(`Using Supabase project: ${url}`);
console.log(`Renaming login: ${oldPhone} -> ${newPhone}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findByPhone(normalizedPhone) {
  const digitsOnly = normalizedPhone.slice(1); // GoTrue stores phone without the "+"
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("listUsers failed:", error.message);
      process.exit(1);
    }
    const hit = data.users.find((u) => (u.phone ?? "").replace(/[^\d]/g, "") === digitsOnly);
    if (hit) return hit;
    if (data.users.length < 1000) break; // last page
  }
  return null;
}

const oldUser = await findByPhone(oldPhone);
if (!oldUser) {
  console.error(`No account found with phone ${oldPhone}. Double-check the number.`);
  process.exit(1);
}
console.log(`Found account ${oldUser.id} (role: ${oldUser.app_metadata?.role ?? "unknown"}).`);

const clash = await findByPhone(newPhone);
if (clash) {
  console.error(`${newPhone} is already in use by another account (${clash.id}). Refusing to proceed -- pick a different number or fix that account first.`);
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.updateUserById(oldUser.id, {
  phone: newPhone,
  phone_confirm: true,
});
if (error) {
  console.error("Failed:", error.message);
  if (error.cause) console.error("Underlying cause:", error.cause);
  process.exit(1);
}

console.log(`Done. ${data.user.id} now logs in with ${newPhone}.`);
console.log("Nothing else changed -- the same id, profile row, and every linked record are untouched.");
console.log("If the wrong number was also saved as a CONTACT phone (Parent/Coach Ayarlar > Telefon), fix that separately -- it's a different field.");
