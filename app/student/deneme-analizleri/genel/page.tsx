import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { EXAMS_PAGE_SIZE } from "../../constants";
import type { StudentTask } from "../../_components/daily-tasks/types";
import { getStudentExamType } from "@/lib/student-exam-type";
import { GenelAnalysisClient } from "./genel-analysis-client";

async function fetchGenelData(userId: string) {
  const supabase = await createClient();
  const { data: examRows } = await supabase
    .from("student_tasks")
    .select("*")
    .eq("student_id", userId)
    .eq("task_type", "general_exam")
    .order("task_date", { ascending: false })
    .range(0, EXAMS_PAGE_SIZE - 1);

  const exams = (examRows ?? []) as StudentTask[];
  const examIds = exams.map((e) => e.id);

  const { data: mistakeRows } =
    examIds.length > 0
      ? await supabase
          .from("student_task_topic_mistakes")
          .select("task_id, course_id, topic_id")
          .in("task_id", examIds)
      : { data: [] };

  return {
    exams,
    mistakes: (mistakeRows ?? []) as { task_id: string; course_id: string; topic_id: string }[],
    hasMore: exams.length === EXAMS_PAGE_SIZE,
  };
}

export default async function GenelAnalysisPage() {
  const view = await getViewContext("student");
  const examType = await getStudentExamType();

  const { exams, mistakes, hasMore } = view
    ? await fetchGenelData(view.effectiveUserId)
    : { exams: [], mistakes: [], hasMore: false };

  return <GenelAnalysisClient initialExams={exams} initialMistakes={mistakes} initialHasMore={hasMore} examType={examType} />;
}
