// One-off backfill for the Phase 2 rollup table (migration 0072): calls
// the new recompute_student_topic_stats(p_student_id, p_course_id,
// p_topic_id) RPC once for every distinct (student, course, topic)
// combination that has ever appeared in student_tasks, populating
// student_topic_stats from the platform's full existing history. Purely
// additive -- only ever writes rows into the new table, never touches
// student_tasks or any other existing table/row.
//
// Safe to re-run any time as a reconciliation pass: the RPC recomputes
// each bucket from scratch and upserts, so running this again after the
// write-site wiring is live just re-confirms everything already agrees
// with raw student_tasks history (self-healing, same as
// recompute_student_daily_stats already works).
//
// Requires the 0072 migration to already be applied (student_topic_stats
// table + recompute_student_topic_stats function must exist).
//
// Usage (run from the project root):
//   node --env-file=.env.production-admin.local scripts/backfill-student-topic-stats.mjs

import { createClient } from "@supabase/supabase-js";

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

// Pull every (student_id, course_id, topic_id) triple that's ever
// appeared in student_tasks with a non-null course_id -- the same rows
// the recompute RPC's own WHERE clause would ever match a bucket for.
// Paged since a hosted PostgREST call defaults to a 1000-row cap.
console.log("Enumerating distinct (student, course, topic) combinations from student_tasks...");
const combos = new Set();
let from = 0;
const PAGE = 1000;
for (;;) {
  const { data, error } = await supabase
    .from("student_tasks")
    .select("student_id, course_id, topic_id")
    .not("course_id", "is", null)
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("Failed to read student_tasks:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  for (const row of data) {
    combos.add(JSON.stringify([row.student_id, row.course_id, row.topic_id ?? "karma"]));
  }
  if (data.length < PAGE) break;
  from += PAGE;
}

const triples = [...combos].map((s) => JSON.parse(s));
console.log(`Found ${triples.length} distinct (student, course, topic) buckets to backfill.\n`);

let ok = 0;
let failed = 0;
const CONCURRENCY = 10;
for (let i = 0; i < triples.length; i += CONCURRENCY) {
  const batch = triples.slice(i, i + CONCURRENCY);
  const results = await Promise.all(
    batch.map(([student_id, course_id, topic_id]) =>
      supabase.rpc("recompute_student_topic_stats", { p_student_id: student_id, p_course_id: course_id, p_topic_id: topic_id }),
    ),
  );
  for (const [idx, r] of results.entries()) {
    if (r.error) {
      failed += 1;
      const [student_id, course_id, topic_id] = batch[idx];
      console.error(`  FAILED  student=${student_id} course=${course_id} topic=${topic_id} -- ${r.error.message}`);
    } else {
      ok += 1;
    }
  }
  process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, triples.length)}/${triples.length}`);
}
console.log(`\n\nDone. ${ok} buckets backfilled, ${failed} failed.`);
if (failed > 0) process.exit(1);
