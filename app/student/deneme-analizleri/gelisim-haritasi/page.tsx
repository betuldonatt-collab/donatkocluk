import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { curriculumCourseIdsFor } from "@/lib/curriculum/cohort";
import { computeGelisimHaritasiBySource, type GelisimHaritasiRow, type TrialSource } from "@/lib/gelisim-haritasi";
import type { ExamType } from "@/lib/exam-type";
import { getStudentExamType } from "@/lib/student-exam-type";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { GelisimHaritasi } from "../_components/gelisim-haritasi";

async function fetchGelisimHaritasi(userId: string, examType: ExamType): Promise<Record<TrialSource, GelisimHaritasiRow[]>> {
  const supabase = await createClient();
  // An 11th grader's map covers its own and the Maarif TYT courses; every other cohort keeps what it had.
  const maarifGrade = await fetchMaarifGrade(supabase, userId);
  // Soft coach approval: exclude a student's own pending self-created
  // exams from this analytics view until a coach approves them (see
  // app/coach/actions.ts's approveStudentTask); coach-assigned exams
  // are always pre-approved.
  const { data: examRows } = await supabase
    .from("student_tasks")
    // title / subject_scores / analysis_pending: which courses a Genel Deneme covers (TYT vs AYT track ...) and whether its topic
    // analysis is still pending (such an exam is left out of the map).
    .select("id, task_date, task_type, course_id, title, subject_scores, analysis_pending")
    .eq("student_id", userId)
    .in("task_type", ["branch_exam", "general_exam"])
    .or("is_coach_assigned.eq.true,is_approved_by_coach.eq.true")
    .order("task_date", { ascending: false });

  const exams = examRows ?? [];
  const examIds = exams.map((e) => e.id);

  const { data: mistakeRows } =
    examIds.length > 0
      ? await supabase.from("student_task_topic_mistakes").select("task_id, course_id, topic_id, status").in("task_id", examIds)
      : { data: [] };

  return computeGelisimHaritasiBySource(curriculumCourseIdsFor(examType, maarifGrade === 11 ? 11 : null), exams, mistakeRows ?? []);
}

export default async function GelisimHaritasiPage() {
  const view = await getViewContext("student");
  const examType = await getStudentExamType();
  const rowsBySource = view ? await fetchGelisimHaritasi(view.effectiveUserId, examType) : { all: [], general: [], branch: [] };

  return <GelisimHaritasi rowsBySource={rowsBySource} examType={examType} />;
}
