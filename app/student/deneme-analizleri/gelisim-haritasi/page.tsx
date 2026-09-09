import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { AYT_COURSES_BY_TRACK, BRANCH_EXAM_MACRO_COURSES, TYT_COURSES } from "@/lib/curriculum";
import { computeGelisimHaritasi, type GelisimHaritasiRow } from "@/lib/gelisim-haritasi";
import { GelisimHaritasi } from "../_components/gelisim-haritasi";

const ALL_CURRICULUM_COURSE_IDS = [
  ...TYT_COURSES.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
  ...BRANCH_EXAM_MACRO_COURSES.map((c) => c.id),
];

async function fetchGelisimHaritasi(userId: string): Promise<GelisimHaritasiRow[]> {
  const supabase = await createClient();
  // Soft coach approval: exclude a student's own pending self-created
  // exams from this analytics view until a coach approves them (see
  // app/coach/actions.ts's approveStudentTask); coach-assigned exams
  // are always pre-approved.
  const { data: examRows } = await supabase
    .from("student_tasks")
    .select("id, task_date, task_type, course_id")
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

  return computeGelisimHaritasi(ALL_CURRICULUM_COURSE_IDS, exams, mistakeRows ?? []);
}

export default async function GelisimHaritasiPage() {
  const view = await getViewContext("student");
  const rows = view ? await fetchGelisimHaritasi(view.effectiveUserId) : [];

  return <GelisimHaritasi rows={rows} />;
}
