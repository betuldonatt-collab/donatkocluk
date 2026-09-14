// One-off admin utility: reports a profile's current role plus how many
// rows in other tables reference it, so you know what's actually at stake
// before correcting a wrongly-assigned role. This is specifically NOT the
// "delete profiles row, re-insert" trick used elsewhere in this scripts
// folder for brand-new test accounts -- that trick is only safe when a
// profile has zero dependent rows, since profiles.id cascades deletes into
// coach_students, student_tasks, task_completions, student_resources,
// parent_students, and more. For a real, possibly-already-used account,
// use this to check first, then check-and-fix-profile-role.mjs's sibling
// SQL snippet (which updates in place, never deletes) to actually correct it.
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/check-account-dependents.mjs "+905XXXXXXXXX"

import { createClient } from "@supabase/supabase-js";

const [, , phone] = process.argv;

if (!phone) {
  console.error("Usage: node --env-file=<your-env-file> scripts/check-account-dependents.mjs <phone>");
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

const { data: authUser, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) {
  console.error("auth.users lookup failed:", authError.message);
  process.exit(1);
}
const bare = phone.replace(/^\+/, "");
const user = authUser.users.find((u) => u.phone === bare);
if (!user) {
  console.log(`No auth.users row found for ${phone}.`);
  process.exit(0);
}
console.log(`\nauth.users: id=${user.id}, app_metadata.role=${user.app_metadata?.role ?? "(not set)"}`);

const { data: profile } = await supabase.from("profiles").select("id, role, full_name").eq("id", user.id).maybeSingle();
if (!profile) {
  console.log("public.profiles: MISSING.");
  process.exit(0);
}
console.log(`public.profiles: role=${profile.role}, full_name=${profile.full_name ?? "n/a"}`);

// Every table with an FK into profiles.id that would cascade-delete (or
// otherwise reference) this row -- checked as both "student side" and
// "coach/parent side" where relevant, since a mis-registered account
// could plausibly have rows on either.
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

console.log("\nDependent rows found (0 across the board = safe to correct with zero data-loss risk either way):");
let anyDependents = false;
for (const [label, table, column] of checks) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, user.id);
  if (error) {
    console.log(`  ${label}: could not check (${error.message})`);
    continue;
  }
  if (count && count > 0) anyDependents = true;
  console.log(`  ${label}: ${count ?? 0}`);
}

console.log(
  anyDependents
    ? "\nThis account has real dependent data -- correct the role with an in-place UPDATE (see the SQL below), never delete+re-insert the profiles row."
    : "\nNo dependent data found -- still recommend the in-place UPDATE below over delete+re-insert, but the risk either way is low.",
);
console.log(`\nTo fix the role, run this in the Supabase Dashboard's SQL Editor:`);
console.log(`
alter table public.profiles disable trigger profiles_prevent_self_role_change;
update public.profiles set role = 'parent' where id = '${user.id}';
alter table public.profiles enable trigger profiles_prevent_self_role_change;
`);
