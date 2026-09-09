export type TaskType =
  | "question_bank"
  | "video"
  | "topic_study"
  | "branch_exam"
  | "general_exam"
  | "extra_custom";

export type TaskStatus = "pending" | "done" | "half_done" | "not_done";

export type SubjectScore = { correct: number | null; wrong: number | null; empty: number | null };

export type StudentTask = {
  id: string;
  task_date: string;
  task_type: TaskType;
  title: string;
  description: string | null;
  course_id: string | null;
  // Already returned by every select("*") this type wraps -- just wasn't
  // declared here before. resource_id (singular) is the other stale/
  // incomplete field on this type (student_tasks moved to a task_resources
  // junction table in migration 0032; the coach panel picked that up,
  // this type didn't) -- out of scope for this pass, left as-is.
  topic_id: string | null;
  resource_id: string | null;
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
  subject_scores: Record<string, SubjectScore> | null;
  completed: boolean;
  analysis_pending: boolean;
  status: TaskStatus;
  reason: string | null;
  note: string | null;
  is_coach_assigned: boolean;
  order_index: number;
  // Set by the coach's own rejectStudentTask (soft-reject, not a hard
  // delete) -- a self-created task the coach chose not to approve stays
  // visible on the student's own board with this reason instead of just
  // vanishing with no explanation.
  rejected_at: string | null;
  rejection_reason: string | null;
  // Not a DB column -- computed server-side per task from the week_locks
  // table (migration 0037) and attached wherever student_tasks is
  // fetched for the student's own views. RLS is the real enforcement (a
  // locked task's UPDATE/INSERT/DELETE is rejected outright); this flag
  // only drives the read-only rendering so the UI doesn't just fail
  // silently when the student tries to interact with it.
  week_locked: boolean;
};

export type TopicMistakeStatus = "wrong" | "blank";
export type TopicMistake = { course_id: string; topic_id: string; status: TopicMistakeStatus };

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  question_bank: "Soru Çözümü",
  video: "Video İzleme",
  topic_study: "Konu Anlatımı / Tekrarı",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  extra_custom: "Ekstra Çalışma",
};

// Mirrors the coach panel's kanban coloring (task-card-body.tsx) so a
// task looks the same regardless of which side is viewing it -- ported
// rather than shared/imported, per this repo's convention of duplicating
// UI across panels instead of cross-importing.
export function statusBorderClass(task: Pick<StudentTask, "status" | "completed">) {
  const isDone = task.status === "done" || task.completed;
  if (isDone) return "border-l-emerald-500";
  if (task.status === "half_done") return "border-l-amber-500";
  if (task.status === "not_done") return "border-l-rose-500";
  return "";
}

export function examTintClass(task: Pick<StudentTask, "task_type">) {
  if (task.task_type === "general_exam") return "bg-indigo-500/20";
  if (task.task_type === "branch_exam") return "bg-indigo-500/10";
  return "bg-card";
}
