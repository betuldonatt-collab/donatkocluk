import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Kaynak Taraması (task_type "resource_review") and Kaynak Takibi:
//   * its Doğru / Yanlış / Boş reach the Kaynak Takibi question columns exactly as a Soru Çözümü's do -- through the
//     student_topic_stats rollup (recompute_student_topic_stats, migrations 0072 / 0083), which counts the finished,
//     coach-vetted tasks of a (course, topic) WHATEVER their task type;
//   * it is NOT connected to the manual "Kaynak Taraması Yapıldı" tick (student_resource_progress.reviewed), which stays
//     the student's / coach's own checkbox. These tests keep both facts from silently changing.

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [rel] : [];
  });
}

describe("Kaynak Taraması results reach the Kaynak Takibi question columns like a Soru Çözümü's", () => {
  it("the stats rollup function counts tasks by course and topic only, with no task-type filter", () => {
    for (const migration of ["supabase/migrations/0072_student_topic_stats.sql", "supabase/migrations/0083_derive_total_from_dyb.sql"]) {
      const sql = read(migration);
      const fn = sql.slice(sql.indexOf("recompute_student_topic_stats"));
      expect(fn, migration).not.toMatch(/task_type/);
    }
  });

  it("the Kaynak Takibi loaders read that rollup (not the tasks by type)", () => {
    for (const file of ["app/student/kaynak-takibi/page.tsx", "app/coach/students/[id]/page.tsx"]) {
      expect(read(file), file).toContain('"student_topic_stats"');
    }
  });

  it("every task write that changes a result re-syncs the (course, topic) bucket regardless of the task's type", () => {
    // the student's progress save and the coach's approval / edit paths call recomputeTopicStats from the saved row's
    // course and topic, never branching on the task type first
    const student = read("app/student/actions.ts");
    const call = student.indexOf("await recomputeTopicStats(supabase, data.student_id, data.course_id, data.topic_id)");
    expect(call).toBeGreaterThan(0);
    expect(student.slice(call - 300, call)).toMatch(/data\.course_id &&/);
    expect(student.slice(call - 300, call)).not.toMatch(/task_type/);
  });
});

describe("the manual 'Kaynak Taraması Yapıldı' tick stays independent", () => {
  it("nothing in the Kaynak Takibi screens or their actions mentions the resource_review task type", () => {
    const files = [...sourceFiles("app/student/kaynak-takibi"), ...sourceFiles("components").filter((f) => /topic-pipeline|maarif-table-body|read-only-subtopics/.test(f)), "app/coach/students/[id]/_components/editable-course-table.tsx", "app/coach/students/[id]/_components/kaynak-takibi-tab.tsx"];
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) expect(read(file), file).not.toMatch(/resource_review/);
  });

  it("no action writes student_resource_progress (the tick's table) on behalf of a task", () => {
    for (const file of ["app/student/actions.ts", "app/coach/actions.ts"]) {
      const src = read(file);
      for (const [i] of [...src.matchAll(/student_resource_progress/g)].map((m) => [m.index ?? 0])) {
        // wherever the table is touched, it is in the tick's own toggle action, never next to the task-type logic
        expect(src.slice(Math.max(0, i - 400), i + 400), file).not.toMatch(/resource_review|isSoruCozumuLike/);
      }
    }
  });
});
