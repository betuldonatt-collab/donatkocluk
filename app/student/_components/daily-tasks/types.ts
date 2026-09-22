import { subjectBackgroundClass, taskStatusBorderClass } from "@/lib/subject-colors";

export type TaskType =
  | "question_bank"
  | "video"
  | "topic_study"
  | "branch_exam"
  | "general_exam"
  | "extra_custom"
  | "reading";

export type TaskStatus = "pending" | "done" | "half_done" | "not_done";

export type SubjectScore = { correct: number | null; wrong: number | null; empty: number | null };

// Mirrors the coach panel's VideoLink (app/coach/students/[id]/types.ts),
// plus `watched` -- an addition scoped to the student side only, since
// that's the side that actually watches the video. Stored inline in each
// video_links array entry rather than a separate table: no per-link id
// exists to key a separate row on, and the array itself is already the
// natural unit a task's video links come and go as.
export type VideoLink = { url: string; title: string | null; watched: boolean };

export type StudentTask = {
  id: string;
  task_date: string;
  task_type: TaskType;
  title: string;
  description: string | null;
  course_id: string | null;
  // Already returned by every select("*") this type wraps -- just wasn't
  // declared here before. resource_id (singular) is stale/unused (student_
  // tasks moved to a task_resources junction table in migration 0032; the
  // coach panel picked that up, this column never did) -- left as-is, not
  // read anywhere. resource_names below is the real, current answer: the
  // linked resources' names, in order, fetched via that same junction
  // table (app/student/page.tsx's fetchHomeData) -- a student previously
  // had no way to see which book/kaynak a coach assigned a task from,
  // anywhere in the panel, not even in the full task modal.
  topic_id: string | null;
  resource_id: string | null;
  resource_names: string[];
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
  tracked_duration_minutes: number;
  subject_scores: Record<string, SubjectScore> | null;
  video_links: VideoLink[];
  completed: boolean;
  analysis_pending: boolean;
  // Kanıt Fotoğrafı: Storage paths of the photos attached to this task (0087).
  evidence_image_paths?: string[];
  // Coach review of those photos (0088): a completed photo-backed task is held
  // as status "pending" until the coach approves it.
  evidence_review_status?: "none" | "pending" | "approved" | "rejected";
  // The coach's verdict per photo (0089): storage path -> approved / rejected.
  // A photo that is not in the map has not been reviewed yet.
  evidence_photo_status?: Record<string, "approved" | "rejected">;
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

// Mirrors the coach panel's own StudentFixedTask (app/coach/actions.ts) --
// "Sabit Görevler", the student's recurring weekly skeleton (school
// hours, sports, ...), managed by the coach on the Program tab and shown
// here read-only. day_of_week: 0=Monday..6=Sunday, same convention as
// every other day-of-week value in this app.
export type StudentFixedTask = {
  id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  // Coach's note shown under the title (line breaks kept); null = none.
  description: string | null;
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
  reading: "Kitap Okuma",
};

// Thick, full-saturation status border -- mirrors the coach panel's own
// statusClasses (task-card-body.tsx), both backed by the same shared
// color data in lib/subject-colors.ts (pure lookup, no UI framework
// dependency, so sharing it doesn't break this repo's per-panel
// UI-duplication convention -- each panel keeps its own function name and
// call sites).
export function statusBorderClass(task: Pick<StudentTask, "status" | "completed">) {
  return taskStatusBorderClass(task.status, task.completed);
}

// Subject-hierarchical pastel background -- mirrors the coach panel's own
// cardBackgroundClass. Renamed from examTintClass: it now colors every
// task by subject family, not just exams.
export function subjectTintClass(task: Pick<StudentTask, "task_type" | "course_id">) {
  return subjectBackgroundClass(task.course_id, task.task_type);
}
