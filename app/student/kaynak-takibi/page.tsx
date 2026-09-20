import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { KARMA_TOPIC_ID } from "@/lib/curriculum";
import { PIPELINE_CONFIG, groupPipelineRows, pipelineSelectColumns, type PipelineRow } from "@/lib/topic-pipeline";
import { getStudentExamType } from "@/lib/student-exam-type";
import type { ResourceTotals } from "./_components/totals-summary";
import { KaynakTakibiClient, type CourseData } from "./kaynak-takibi-client";

const EMPTY_STAT = { total: 0, correct: 0, wrong: 0, empty: 0 };

export default async function KaynakTakibiPage() {
  const view = await getViewContext("student");
  const supabase = await createClient();
  const examType = await getStudentExamType();

  const courseData: Record<string, CourseData> = {};

  if (view) {
    const [{ data: resourceRows }, { data: progressRows }, { data: topicStatsRows }] = await Promise.all([
      supabase
        .from("student_resources")
        .select("id, name, course_id, kind, total_stock, remaining_stock")
        .eq("student_id", view.effectiveUserId)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resource_progress")
        .select("course_id, topic_id, resource_id, solved, reviewed")
        .eq("student_id", view.effectiveUserId),
      // Sourced from student_topic_stats (migration 0072) instead of
      // student_tasks directly -- that rollup already applies the exact
      // same counting rule this query used to apply itself (coach-
      // provenanced, status in done/half_done, total_count present) at
      // write time, maintained incrementally by every student_tasks
      // write site (app/student/actions.ts, app/coach/actions.ts). A
      // fixed-size read keyed by (course, topic), not one that grows with
      // total lifetime task count. Same swap already applied and verified
      // on the coach's own equivalent view (app/coach/students/[id]/page.tsx).
      supabase
        .from("student_topic_stats")
        .select("course_id, topic_id, total_count, correct_count, wrong_count, empty_count")
        .eq("student_id", view.effectiveUserId),
    ]);

    // Per-topic pipeline checkboxes -- the cohort's own table (LGS: 4 steps,
    // YKS: 2). A missing table (migration not run yet) just reads as empty.
    const pipelineConfig = PIPELINE_CONFIG[examType];
    const { data: pipelineRows, error: pipelineError } = await supabase
      .from(pipelineConfig.table)
      .select(pipelineSelectColumns(pipelineConfig))
      .eq("student_id", view.effectiveUserId);
    if (pipelineError) console.error("[kaynak-takibi] pipeline read failed:", pipelineError);
    const pipelineByCourse = groupPipelineRows((pipelineRows ?? []) as unknown as PipelineRow[], pipelineConfig);

    function courseEntry(courseId: string): CourseData {
      return (courseData[courseId] ??= { resources: [], branchExamResources: [], progress: {}, pipeline: pipelineByCourse[courseId] ?? {}, topicStats: { byTopic: {}, karma: { ...EMPTY_STAT } } });
    }

    // A course with pipeline ticks but no resources yet still needs its entry.
    for (const courseId of Object.keys(pipelineByCourse)) courseEntry(courseId);

    for (const row of resourceRows ?? []) {
      const entry = courseEntry(row.course_id);
      // Branch-trial resources are inventory (Toplam/Kalan Deneme), not
      // topic-checklist material -- kept out of the resources list the
      // solved/reviewed matrix reads from.
      if (row.kind === "branch_exam") {
        entry.branchExamResources.push({ id: row.id, name: row.name, total_stock: row.total_stock ?? 0, remaining_stock: row.remaining_stock ?? 0 });
      } else {
        entry.resources.push({ id: row.id, name: row.name });
      }
    }

    for (const row of progressRows ?? []) {
      const entry = courseEntry(row.course_id);
      const key = `${row.topic_id}::${row.resource_id}`;
      entry.progress[key] = { solved: row.solved, reviewed: row.reviewed };
    }

    for (const row of topicStatsRows ?? []) {
      const entry = courseEntry(row.course_id);
      // "karma" is a real, selectable topic (KARMA_TOPIC_ID, lib/curriculum)
      // meaning "mixed topics" -- the rollup already folds a null raw
      // topic_id into it, so topic_id here is always a real value. A
      // zero-total byTopic row is skipped (can linger in the rollup after
      // its one contributing task is deleted -- the RPC zeroes rather
      // than deletes that bucket row); karma is always rendered, matching
      // its pre-existing "always present" shape from EMPTY_STAT above.
      const stat = { total: row.total_count, correct: row.correct_count, wrong: row.wrong_count, empty: row.empty_count };
      if (row.topic_id === KARMA_TOPIC_ID) {
        entry.topicStats.karma = stat;
      } else if (row.total_count > 0) {
        entry.topicStats.byTopic[row.topic_id] = stat;
      }
    }
  }

  // Same source as the per-topic/Karma rows below (every course's
  // topicStats), summed once across all courses -- the "Toplam Soru" card
  // and the table it sits above now always agree, by construction.
  const totals: ResourceTotals = Object.values(courseData).reduce(
    (acc, course) => {
      for (const stat of [...Object.values(course.topicStats.byTopic), course.topicStats.karma]) {
        acc.total += stat.total;
        acc.correct += stat.correct;
        acc.wrong += stat.wrong;
        acc.empty += stat.empty;
      }
      return acc;
    },
    { ...EMPTY_STAT },
  );

  return <KaynakTakibiClient initialCourseData={courseData} totals={totals} examType={examType} />;
}
