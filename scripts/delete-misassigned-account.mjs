// One-off admin utility: deletes an auth.users row (and, via on-delete-
// cascade, its public.profiles row) so the same phone number can submit a
// fresh signup request with the correct role. This is destructive and
// irreversible -- unlike the rest of this scripts folder's "adjust in
// place" fixes, there is no undo here.
//
// Safety: this script re-checks every table that could reference the
// profile (the same checks as check-account-dependents.mjs) and REFUSES
// to delete anything if it finds even one dependent row, regardless of
// what you already believe about the account's history. There is no
// override flag -- if this refuses and you're certain it's still safe,
// come back and we'll look at exactly what it found together rather than
// bypassing the check.
//
// Same safety properties as the rest of this folder: run locally with
// your own service-role key, never called from the deployed app or from
// Claude, the key never leaves your machine.
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/delete-misassigned-account.mjs "+905XXXXXXXXX"

import { createClient } from "@supabase/supabase-js";

const [, , phone] = process.argv;

if (!phone) {
  console.error("Usage: node --env-file=<your-env-file> scripts/delete-misassigned-account.mjs <phone>");
  process.exit(1);
}
if (!/^\+90\d{10}$/.test(phone)) {
  console.error(`Phone "${phone}" doesn't look like +90XXXXXXXXXX (must be +90 followed by exactly 10 digits).`);
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

const { data: listResult, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) {
  console.error("auth.users lookup failed:", listError.message);
  process.exit(1);
}
const bare = phone.replace(/^\+/, "");
const user = listResult.users.find((u) => u.phone === bare);
if (!user) {
  console.log(`No auth.users row found for ${phone} -- nothing to delete.`);
  process.exit(0);
}

const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
console.log(`\nFound: id=${user.id}, role=${profile?.role ?? "(no profile row)"}, full_name=${profile?.full_name ?? "n/a"}`);

const checks = [
  ["coach_students (as student)", "coach_students", "student_id"],
  ["coach_students (as coach)", "coach_students", "coach_id"],
  ["parent_students (as parent)", "parent_students", "parent_id"],
  ["parent_students (as student)", "parent_students", "student_id"],
  ["student_tasks", "student_tasks", "student_id"],
  ["task_completions", "task_completions", "student_id"],
  ["student_resources", "student_resources", "student_id"],
  ["coaching_sessions (as student)", "coaching_sessions", "student_id"],
  ["coaching_sessions (as coach)", "coaching_sessions", "coach_id"],
  ["coach_notes (as student)", "coach_notes", "student_id"],
  ["coach_notes (as coach)", "coach_notes", "coach_id"],
];

console.log("\nRe-checking dependent rows before doing anything irreversible...");
let anyDependents = false;
for (const [label, table, column] of checks) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, user.id);
  if (error) {
    console.error(`  Could not check ${label} (${error.message}) -- refusing to proceed since this check is incomplete.`);
    process.exit(1);
  }
  if (count && count > 0) {
    console.error(`  ${label}: ${count} row(s) found.`);
    anyDependents = true;
  } else {
    console.log(`  ${label}: 0`);
  }
}

if (anyDependents) {
  console.error("\nRefusing to delete -- this account has real dependent data. Use the in-place role UPDATE instead (see check-account-dependents.mjs's output) so nothing is lost.");
  process.exit(1);
}

console.log("\nConfirmed clean. Deleting auth.users row (cascades to profiles automatically)...");
const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
if (deleteError) {
  console.error("Failed:", deleteError.message);
  process.exit(1);
}

console.log(`Done. ${phone} no longer has an account and can submit a fresh signup request.`);
