import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { curriculumCourseIdsFor } from "@/lib/curriculum/cohort";
import type { TopicMistakeRow, TrialExam } from "@/lib/gelisim-haritasi";
import type { ExamType } from "@/lib/exam-type";
import { fetchAllPages } from "@/lib/paged-select";
import { getStudentExamType } from "@/lib/student-exam-type";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { GelisimHaritasi } from "../_components/gelisim-haritasi";

// How many exam ids go into one `.in()` filter: a long list would make the request URL too long.
const EXAM_ID_CHUNK = 100;

// The map is computed in the browser (it follows the student's date range and the Tümü / Genel / Branş switch), so this hands
// over the raw history -- every exam and every topic mark, read page by page so a long history is never silently cut at the
// API's row limit.
async function fetchGelisimData(
  userId: string,
  examType: ExamType,
): Promise<{ exams: TrialExam[]; mistakes: TopicMistakeRow[]; courseIds: string[] }> {
  const supabase = await createClient();
  // An 11th grader's map covers its own and the Maarif TYT courses; every other cohort keeps what it had.
  const maarifGrade = await fetchMaarifGrade(supabase, userId);
  // Soft coach approval: exclude a student's own pending self-created
  // exams from this analytics view until a coach approves them (see
  // app/coach/actions.ts's approveStudentTask); coach-assigned exams
  // are always pre-approved.
  const { data: examRows } = await fetchAllPages<TrialExam>((from, to, withCount) =>
    supabase
      .from("student_tasks")
      // title / subject_scores / analysis_pending: which courses a Genel Deneme covers (TYT vs AYT track ...) and whether its
      // topic analysis is still pending (such an exam is left out of the map).
      .select("id, task_date, task_type, course_id, title, subject_scores, analysis_pending", withCount ? { count: "exact" } : undefined)
      .eq("student_id", userId)
      .in("task_type", ["branch_exam", "general_exam"])
      .or("is_coach_assigned.eq.true,is_approved_by_coach.eq.true")
      .order("task_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: TrialExam[] | null; error: unknown; count?: number | null }>,
  );

  const examIds = examRows.map((e) => e.id);
  const chunks: string[][] = [];
  for (let i = 0; i < examIds.length; i += EXAM_ID_CHUNK) chunks.push(examIds.slice(i, i + EXAM_ID_CHUNK));
  const pages = await Promise.all(
    chunks.map((ids) =>
      fetchAllPages<TopicMistakeRow>((from, to, withCount) =>
        supabase
          .from("student_task_topic_mistakes")
          .select("task_id, course_id, topic_id, status", withCount ? { count: "exact" } : undefined)
          .in("task_id", ids)
          .order("task_id", { ascending: true })
          .order("course_id", { ascending: true })
          .order("topic_id", { ascending: true })
          .order("status", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: TopicMistakeRow[] | null; error: unknown; count?: number | null }>,
      ),
    ),
  );

  return {
    exams: examRows,
    mistakes: pages.flatMap((p) => p.data),
    courseIds: curriculumCourseIdsFor(examType, maarifGrade === 11 ? 11 : null),
  };
}

export default async function GelisimHaritasiPage() {
  const view = await getViewContext("student");
  const examType = await getStudentExamType();
  const data = view ? await fetchGelisimData(view.effectiveUserId, examType) : { exams: [], mistakes: [], courseIds: [] };

  return <GelisimHaritasi exams={data.exams} mistakes={data.mistakes} courseIds={data.courseIds} examType={examType} />;
}
