import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { KARMA_TOPIC_ID } from "@/lib/curriculum";
import type { ResourceTotals } from "./_components/totals-summary";
import { KaynakTakibiClient, type CourseData } from "./kaynak-takibi-client";

const EMPTY_STAT = { total: 0, correct: 0, wrong: 0, empty: 0 };

export default async function KaynakTakibiPage() {
  const view = await getViewContext("student");
  const supabase = await createClient();

  const courseData: Record<string, CourseData> = {};

  if (view) {
    const [{ data: resourceRows }, { data: progressRows }, { data: taskRows }] = await Promise.all([
      supabase
        .from("student_resources")
        .select("id, name, course_id, kind, total_stock, remaining_stock")
        .eq("student_id", view.effectiveUserId)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resource_progress")
        .select("course_id, topic_id, resource_id, solved, reviewed")
        .eq("student_id", view.effectiveUserId),
      // Any task carrying a score contributes to its course's topic
      // breakdown below -- a null topic_id (no specific topic picked)
      // is exactly what the table's "Karma / Karışık Çözümler" row
      // catches, so every scored task lands somewhere and the rows
      // always sum to the course total with no discrepancy.
      // Soft coach approval: a student's own self-created entry only
      // counts toward this analytics view once a coach has reviewed it
      // (approveStudentTask, app/coach/actions.ts) -- coach-assigned
      // tasks are always pre-approved. Pending entries still show up
      // fine in the student's own daily task board, just not here.
      //
      // status in (done, half_done): total_count can be set by the coach
      // as the PLAN at assignment time (e.g. "solve 20 questions"), before
      // the student has touched it -- status stays 'pending' until they
      // actually do. Without this filter that planned count was being
      // counted as if already solved. 'half_done' is still genuine,
      // self-reported work (just not the full plan), so it's included;
      // 'pending' (untouched) and 'not_done' (explicitly skipped) are not.
      supabase
        .from("student_tasks")
        .select("course_id, topic_id, total_count, correct_count, wrong_count, empty_count")
        .eq("student_id", view.effectiveUserId)
        .not("total_count", "is", null)
        .not("course_id", "is", null)
        .or("is_coach_assigned.eq.true,is_approved_by_coach.eq.true")
        .in("status", ["done", "half_done"]),
    ]);

    function courseEntry(courseId: string): CourseData {
      return (courseData[courseId] ??= { resources: [], branchExamResources: [], progress: {}, topicStats: { byTopic: {}, karma: { ...EMPTY_STAT } } });
    }

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

    for (const row of taskRows ?? []) {
      const entry = courseEntry(row.course_id!);
      // "karma" is a real, selectable topic (KARMA_TOPIC_ID, lib/curriculum)
      // meaning "mixed topics" -- not the absence of one -- so both a null
      // topic_id and an explicit "karma" pick land in the Karma row. Every
      // other topic_id is a genuine syllabus topic and gets its own row.
      const hasRealTopic = row.topic_id && row.topic_id !== KARMA_TOPIC_ID;
      const bucket = hasRealTopic ? (entry.topicStats.byTopic[row.topic_id!] ??= { ...EMPTY_STAT }) : entry.topicStats.karma;
      bucket.total += row.total_count ?? 0;
      bucket.correct += row.correct_count ?? 0;
      bucket.wrong += row.wrong_count ?? 0;
      bucket.empty += row.empty_count ?? 0;
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

  return <KaynakTakibiClient initialCourseData={courseData} totals={totals} />;
}
