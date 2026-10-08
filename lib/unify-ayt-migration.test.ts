import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LEGACY_COURSE_ID_MAP } from "./curriculum/legacy-course-ids";

// Migration 0133 runs in Postgres, which these tests cannot execute; they keep its id map identical to the one the app uses (so the data and
// the code can never disagree about which id became which) and pin the safety properties of the SQL.
const sql = readFileSync(new URL("../supabase/migrations/0133_unify_shared_ayt_courses.sql", import.meta.url), "utf8");
const body = sql.slice(sql.indexOf("do $mig$"), sql.indexOf("$mig$;\n"));

describe("migration 0133 (unify the shared AYT courses)", () => {
  it("its course map is exactly the app's LEGACY_COURSE_ID_MAP", () => {
    const insert = body.slice(body.indexOf("insert into m0133_courses values"), body.indexOf("create temporary table m0133_prefix"));
    const pairs = Object.fromEntries([...insert.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]));
    expect(pairs).toEqual({ ...LEGACY_COURSE_ID_MAP });
  });

  it("rewrites every table that stores a course id (and rebuilds the derived stats), and nothing else", () => {
    for (const table of [
      "student_tasks",
      "student_task_topic_mistakes",
      "student_task_topic_breakdown",
      "student_resources",
      "student_resource_progress",
      "yks_topic_pipeline_status",
      "student_topic_stats",
    ]) {
      expect(body, table).toContain(`public.${table}`);
    }
    // archived Karne snapshots are read through the unified ids, never rewritten
    expect(body).not.toMatch(/update public\.student_report_cards/);
    expect(body).not.toMatch(/delete from public\.student_report_cards/);
  });

  it("is one atomic block with backups, a merge instead of an overwrite, the guard trigger switched back on, and hard checks", () => {
    expect(body.startsWith("do $mig$")).toBe(true);
    for (const backup of ["m0133_student_tasks", "m0133_mistakes", "m0133_breakdown", "m0133_resources", "m0133_resource_progress", "m0133_pipeline", "m0133_topic_stats"]) {
      expect(body, backup).toContain(`migration_backups.${backup}`);
    }
    expect(body).toContain("disable trigger student_tasks_prevent_core_tampering");
    expect(body).toContain("enable trigger student_tasks_prevent_core_tampering");
    expect(body.indexOf("enable trigger")).toBeGreaterThan(body.indexOf("disable trigger"));
    // breakdown counts are added and pipeline ticks OR-ed into the survivor
    expect(body).toMatch(/total_questions = s\.total_questions \+ agg\.total_questions/);
    expect(body).toMatch(/konu_calismasi = s\.konu_calismasi or agg\.konu_calismasi/);
    // the checks that roll everything back
    expect(body).toMatch(/raise exception 'student_tasks row count changed/);
    expect(body).toMatch(/raise exception 'question totals changed for student/);
    expect(body).toMatch(/raise exception '% records still carry an old course\/topic id/);
  });

  it("never deletes a task, and drops a duplicate row only after folding it into its survivor", () => {
    expect(body).not.toMatch(/delete from public\.student_tasks/);
    // the only deletes: duplicates of a survivor, plus the derived stats of the old ids
    const deletes = [...body.matchAll(/delete from ([a-z_.]+)/g)].map((m) => m[1]);
    expect(deletes.sort()).toEqual(
      ["public.student_task_topic_mistakes", "public.student_task_topic_breakdown", "public.yks_topic_pipeline_status", "public.student_topic_stats"].sort(),
    );
    // each folded delete only targets rows whose survivor is a different row
    expect((body.match(/sv\.moved_id <> sv\.survivor_id/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
