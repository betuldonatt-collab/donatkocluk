// TEMPORARY, throwaway one-off: bulk-inserts historical coaching_sessions rows
// (already-completed past meetings, entered after the fact) so the coach
// doesn't have to click through the normal "create session -> mark completed"
// UI flow 100+ times. Delete this file once the backfill is done -- nothing
// else in the app depends on it.
//
// Design, and why it's the SAFE way to bulk-insert completed sessions (not
// reusable pieces of the coach UI's own flow):
//
//   - Inserts DIRECTLY into public.coaching_sessions with outcome already
//     'completed', via the service-role client (bypasses RLS entirely, and
//     coaching_sessions_prevent_student_tampering (0020) only fires on
//     UPDATE, never INSERT -- so a plain insert is completely unrestricted,
//     no workaround needed).
//   - Deliberately does NOT call the app's own evaluateSessionCompleted
//     server action (app/coach/actions.ts). That action is built for
//     completing ONE real, live session, and as a side effect automatically
//     creates a coach_tasks "Ara Görüşme" follow-up 3 days later for EVERY
//     completion, plus a "Veli Görüşmesi" task every 4th one. Reusing it for
//     a 100+ row historical backfill would flood the coach's own daily
//     checklist with ~100 fake follow-up tasks tied to backdated sessions --
//     calling it here would be the opposite of "bypass the noise". A direct
//     insert has none of that.
//   - student_rating / student_feedback / rated_at are left NULL -- honest
//     (nobody actually rated these), and it's what keeps the real rating
//     averages shown elsewhere (admin coach page, coach stats) uncorrupted.
//     One consequence worth knowing: the student panel's "rate a past
//     session" banner shows the SINGLE most recent completed+unrated session
//     -- so each student may see it once for their latest backfilled entry,
//     until their next real session is completed (or they just rate it,
//     since it's a real thing that really happened). No SMS/push/notification
//     row is created by this script either way.
//   - is_paid is set directly, so "Kalan Görüşme Hakkı" / payment status is
//     immediately correct in the Parent Panel -- same column, same
//     paid-minus-completed math (lib/session-balance.ts) the real UI uses.
//     No other table needs touching for parent visibility: the parent panel
//     reads this exact table, scoped by student_id, nothing else.
//   - Safe to re-run: an (student_id, coach_id, scheduled_at) combination
//     already present is skipped, not duplicated.
//
// Same safety properties as every other script in this folder: run LOCALLY
// with your own service-role key, never called from the deployed app or from
// Claude -- the key never leaves your machine.
//
// ---------------------------------------------------------------------------
// USAGE
// ---------------------------------------------------------------------------
// 1. Copy scripts/backfill-sessions.example.json to scripts/backfill-sessions.data.json
//    and fill it in (see that file for the exact shape).
// 2. Preview first (writes nothing):
//      node --env-file=.env.production-admin.local scripts/backfill-sessions.mjs scripts/backfill-sessions.data.json --dry-run
// 3. Then actually insert:
//      node --env-file=.env.production-admin.local scripts/backfill-sessions.mjs scripts/backfill-sessions.data.json
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error("Usage: node --env-file=<your-env-file> scripts/backfill-sessions.mjs <data-file.json> [--dry-run]");
  process.exit(1);
}

function normalizeTurkishPhone(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("5")) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("05")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("905")) return `+${digits}`;
  return null;
}

let input;
try {
  input = JSON.parse(readFileSync(filePath, "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${filePath}:`, e.message);
  process.exit(1);
}

const coachPhone = normalizeTurkishPhone(input.coachPhone);
if (!coachPhone) {
  console.error(`"coachPhone" in the data file is missing or not a valid Turkish number.`);
  process.exit(1);
}
if (!Array.isArray(input.students) || input.students.length === 0) {
  console.error(`"students" in the data file must be a non-empty array.`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Make sure you ran this with: node --env-file=<your-env-file> scripts/backfill-sessions.mjs ...");
  process.exit(1);
}
if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url)) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL is "${url}" -- that's the LOCAL Supabase Docker address, not your hosted project.`);
  process.exit(1);
}

console.log(`Using Supabase project: ${url}`);
console.log(dryRun ? "DRY RUN -- nothing will be written.\n" : "LIVE RUN -- rows will be inserted.\n");

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

const coachUser = await findByPhone(coachPhone);
if (!coachUser) {
  console.error(`No account found with coach phone ${coachPhone}.`);
  process.exit(1);
}
if (coachUser.app_metadata?.role !== "coach") {
  console.error(`${coachPhone} (${coachUser.id}) has role "${coachUser.app_metadata?.role ?? "unknown"}", not "coach". Refusing.`);
  process.exit(1);
}
console.log(`Coach: ${coachPhone} (${coachUser.id})\n`);

let totalInsert = 0;
let totalSkip = 0;
let totalError = 0;

for (const studentEntry of input.students) {
  const studentPhone = normalizeTurkishPhone(studentEntry.phone);
  const sessions = Array.isArray(studentEntry.sessions) ? studentEntry.sessions : [];
  if (!studentPhone) {
    console.error(`  Skipping a student entry -- "${studentEntry.phone}" is not a valid phone.`);
    totalError += sessions.length;
    continue;
  }

  const studentUser = await findByPhone(studentPhone);
  if (!studentUser) {
    console.error(`  ${studentPhone}: no account found -- skipping ${sessions.length} session(s).`);
    totalError += sessions.length;
    continue;
  }

  console.log(`${studentPhone} (${studentUser.id}) -- ${sessions.length} session(s)`);

  // Make sure the coach<->student link exists (coach_students), or the
  // sessions would be invisible to the coach's own panel even though they
  // read fine elsewhere. Auto-links if missing -- these ARE that coach's
  // students, just not yet wired up before this backfill.
  if (!dryRun) {
    const { data: existingLink } = await supabase
      .from("coach_students")
      .select("student_id")
      .eq("coach_id", coachUser.id)
      .eq("student_id", studentUser.id)
      .maybeSingle();
    if (!existingLink) {
      const { error: linkError } = await supabase.from("coach_students").insert({ coach_id: coachUser.id, student_id: studentUser.id });
      if (linkError) {
        console.error(`  Could not link coach<->student: ${linkError.message}`);
      } else {
        console.log("  (linked this student to the coach -- wasn't linked before)");
      }
    }
  }

  for (const s of sessions) {
    if (!s.date) {
      console.error(`  Skipping a session with no "date".`);
      totalError++;
      continue;
    }
    const time = s.time ?? "12:00";
    // Turkey is UTC+3 year-round (no DST since 2016) -- an explicit offset so
    // "18:00" in the data file means 18:00 in Turkey, not UTC or the machine
    // running this script's own local time.
    const scheduledAt = new Date(`${s.date}T${time}:00+03:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      console.error(`  Skipping session with unparseable date/time: ${s.date} ${time}`);
      totalError++;
      continue;
    }
    const scheduledAtIso = scheduledAt.toISOString();
    const isPaid = s.paid ?? true;
    const notes = s.notes ?? "Geçmiş görüşme (manuel olarak sisteme işlendi).";

    const { data: dup } = await supabase
      .from("coaching_sessions")
      .select("id")
      .eq("student_id", studentUser.id)
      .eq("coach_id", coachUser.id)
      .eq("scheduled_at", scheduledAtIso)
      .maybeSingle();
    if (dup) {
      console.log(`  [skip]   ${s.date} ${time} -- already exists (id ${dup.id})`);
      totalSkip++;
      continue;
    }

    console.log(`  [${dryRun ? "would insert" : "insert"}] ${s.date} ${time} · paid=${isPaid}`);
    if (dryRun) {
      totalInsert++;
      continue;
    }

    const { error } = await supabase.from("coaching_sessions").insert({
      student_id: studentUser.id,
      coach_id: coachUser.id,
      scheduled_at: scheduledAtIso,
      outcome: "completed",
      is_paid: isPaid,
      evaluation_notes: notes,
    });
    if (error) {
      console.error(`    Failed: ${error.message}`);
      totalError++;
    } else {
      totalInsert++;
    }
  }
}

console.log(`\n${dryRun ? "Would insert" : "Inserted"}: ${totalInsert} · Skipped (already existed): ${totalSkip} · Errors: ${totalError}`);
if (dryRun) console.log("Re-run without --dry-run to actually write these.");
