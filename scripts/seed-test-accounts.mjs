// One-off admin utility: forcefully provisions (creates, or fixes if they
// already exist) a fixed set of test accounts, one per role. "Forceful"
// means: if the phone is new, create it; if it already exists, overwrite
// its password, app_metadata.role, and profiles.role to the values below
// -- so re-running this script is always safe and always converges to the
// same known-good state, regardless of whatever state these accounts
// drifted into.
//
// Same safety properties as the rest of this folder: run locally with your
// own service-role key, never called from the deployed app or from Claude,
// the key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=<env-file> scripts/seed-test-accounts.mjs
//
// Edit the ACCOUNTS list below to change who gets provisioned.

import { createClient } from "@supabase/supabase-js";

const ACCOUNTS = [
  { phone: "+905432046683", password: "Donat123!", role: "admin", fullName: "Betül Donat" },
  { phone: "+905349217928", password: "123456", role: "coach", fullName: "Test Koç" },
  { phone: "+905356645637", password: "123456", role: "parent", fullName: "Test Veli" },
  { phone: "+905305902508", password: "123456", role: "student", fullName: "Test Öğrenci" },
];

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

console.log(`Using Supabase project: ${url}\n`);

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// GoTrue's admin API has no "find user by phone" endpoint, so a duplicate-
// phone createUser failure is resolved by paginating through listUsers and
// matching on the phone column (stored without the leading "+"). Fine at
// this project's current scale (a handful of accounts); would need real
// pagination if this ever needs to scale past ~1000 users.
async function findUserByPhone(phone) {
  const bare = phone.replace(/^\+/, "");
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.phone === bare) ?? null;
}

const results = [];

for (const { phone, password, role, fullName } of ACCOUNTS) {
  console.log(`--- ${role}: ${phone} ---`);
  let userId;

  const created = await supabase.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });

  if (!created.error) {
    userId = created.data.user.id;
    console.log(`  Created new auth.users row (id: ${userId}).`);
  } else {
    console.log(`  createUser said "${created.error.message}" -- assuming it already exists, looking it up...`);
    const existing = await findUserByPhone(phone);
    if (!existing) {
      console.error(`  Could not find an existing user for ${phone} either. Skipping this account.`);
      results.push({ phone, role, ok: false, reason: created.error.message });
      continue;
    }
    userId = existing.id;
    const updated = await supabase.auth.admin.updateUserById(userId, {
      password,
      phone_confirm: true,
      app_metadata: { role },
    });
    if (updated.error) {
      console.error(`  Failed to update existing user: ${updated.error.message}`);
      results.push({ phone, role, ok: false, reason: updated.error.message });
      continue;
    }
    console.log(`  Updated existing auth.users row (id: ${userId}) -- password + app_metadata.role reset.`);
  }

  // Delete + re-insert, not update -- profiles has a BEFORE UPDATE trigger
  // (profiles_prevent_self_role_change, migration 0001) that raises unless
  // is_admin() is true, which resolves to false for a service-role
  // connection (auth.uid() is NULL, no `sub` claim on that JWT). A fresh
  // INSERT never fires a BEFORE UPDATE trigger, sidestepping this. Safe
  // here specifically because these are dedicated test accounts with no
  // real dependent data -- do not reuse this approach on an established
  // user who already has real data referencing their profile.
  const { error: deleteError } = await supabase.from("profiles").delete().eq("id", userId);
  if (deleteError) {
    console.error(`  Failed to clear old profiles row: ${deleteError.message}`);
    results.push({ phone, role, ok: false, reason: deleteError.message });
    continue;
  }
  const { error: insertError } = await supabase.from("profiles").insert({ id: userId, role, full_name: fullName });
  if (insertError) {
    console.error(`  Failed to insert profiles row: ${insertError.message}`);
    results.push({ phone, role, ok: false, reason: insertError.message });
    continue;
  }
  console.log(`  profiles.role set to "${role}".`);

  const { error: lockoutError } = await supabase.from("login_failed_attempts").delete().eq("phone", phone);
  if (lockoutError) console.warn(`  Note: could not clear login_failed_attempts (${lockoutError.message}) -- probably just means there was nothing to clear.`);

  results.push({ phone, role, ok: true, userId });
  console.log("");
}

console.log("=== Summary ===");
for (const r of results) {
  console.log(r.ok ? `  OK    ${r.role.padEnd(7)} ${r.phone}  (${r.userId})` : `  FAIL  ${r.role.padEnd(7)} ${r.phone}  -- ${r.reason}`);
}

const failures = results.filter((r) => !r.ok);
if (failures.length > 0) {
  console.log(`\n${failures.length} account(s) failed -- see above.`);
  process.exit(1);
}
console.log("\nAll 4 accounts are provisioned and ready to log in.");
