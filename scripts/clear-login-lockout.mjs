// One-off admin utility: clears a locked-out login, both layers of it.
//
// 1. public.login_failed_attempts (migration 0041) -- this app's OWN brute-force
//    lock, keyed by phone, zero RLS grants to anon/authenticated (reachable only
//    via the service-role client, exactly like clearFailedAttempts() in
//    lib/login-lockout.ts, which this mirrors -- that function isn't reusable
//    here directly since it's a server-only TS module). This is what actually
//    produces the "Çok fazla hatalı deneme nedeniyle hesabın geçici olarak
//    kilitlendi..." message this app shows -- 5 wrong passwords, self-expires
//    after 30 minutes on its own.
// 2. Supabase Auth's OWN ban (auth.users.banned_until / GoTrue's own rate
//    limiting) -- a separate mechanism this app doesn't set itself, but cleared
//    here too, defensively, in case GoTrue banned the account on its own.
//
// This is NOT profiles.is_active (a third, different mechanism, a different
// message: "Bu hesap pasif durumda...") -- unaffected by this script.
//
// Same safety properties as the other scripts in this folder: run locally with
// your own service-role key, never called from the deployed app or from
// Claude -- the key never leaves your machine.
//
// Usage (run from the project root, phone in any common format):
//   node --env-file=.env.production-admin.local scripts/clear-login-lockout.mjs "05432046683"

import { createClient } from "@supabase/supabase-js";

const [, , phoneRaw] = process.argv;

if (!phoneRaw) {
  console.error("Usage: node --env-file=<your-env-file> scripts/clear-login-lockout.mjs <phone>");
  console.error('Example: node --env-file=.env.production-admin.local scripts/clear-login-lockout.mjs "05432046683"');
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

const phone = normalizeTurkishPhone(phoneRaw);
if (!phone) {
  console.error(`Phone "${phoneRaw}" doesn't look like a Turkish mobile number (expected 05XX XXX XX XX).`);
  process.exit(1);
}
const digitsOnly = phone.slice(1); // GoTrue stores auth.users.phone without the "+"

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
console.log(`Phone: ${phone}`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// --- 1. This app's own phone-keyed lock (login_failed_attempts) -----------

const { data: before } = await supabase
  .from("login_failed_attempts")
  .select("fail_count, locked_at")
  .eq("phone", phone)
  .maybeSingle();

if (!before) {
  console.log("[app lock] No row found -- not locked at the phone level.");
} else {
  console.log(`[app lock] Before: fail_count=${before.fail_count}, locked_at=${before.locked_at ?? "(not locked)"}`);
  const { error } = await supabase.from("login_failed_attempts").delete().eq("phone", phone);
  if (error) {
    console.error("[app lock] Failed to clear:", error.message);
    process.exit(1);
  }
  console.log("[app lock] Cleared.");
}

// --- 2. Supabase Auth's own ban, defensively --------------------------------

let found = null;
for (let page = 1; page <= 50 && !found; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("[auth ban] listUsers failed:", error.message);
    break;
  }
  found = data.users.find((u) => (u.phone ?? "").replace(/[^\d]/g, "") === digitsOnly);
  if (data.users.length < 1000) break; // last page
}

if (!found) {
  console.log("[auth ban] No matching auth user found -- skipped.");
} else if (!found.banned_until) {
  console.log("[auth ban] Not banned at the Auth level -- nothing to clear.");
} else {
  console.log(`[auth ban] banned_until was: ${found.banned_until}. Clearing...`);
  const { error } = await supabase.auth.admin.updateUserById(found.id, { ban_duration: "none" });
  if (error) {
    console.error("[auth ban] Failed to clear:", error.message);
    process.exit(1);
  }
  console.log("[auth ban] Cleared.");
}

console.log(`\nDone. ${phone} can attempt to sign in again immediately.`);
console.log("If you're still locked out, it may be the separate per-IP throttle instead (login_ip_attempts, self-expires after 15 minutes, no admin action needed).");
