export type StudentProfile = {
  id: string;
  full_name: string | null;
  coaching_start_date: string | null;
  assigned_meeting_day: string | null;
  city: string | null;
  phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  target_university: string | null;
  target_department: string | null;
  target_ranking: string | null;
  // LGS counterparts of target_university / target_department / obp.
  target_high_school: string | null;
  target_percentile: number | null;
  report_card_average: number | null;
  school_name: string | null;
  sinif_sube: string | null;
  obp: number | null;
  attends_dershane: boolean;
  attends_deneme_kulubu: boolean;
  has_private_tutor: boolean;
  had_previous_coaching: boolean;
  previous_yks_ranking: string | null;
  favorite_subjects: string | null;
  difficult_subjects: string | null;
  remaining_sessions: number;
  exam_type: "YKS" | "LGS";
};

export type VideoLink = { url: string; title: string | null };

export type DetailTask = {
  id: string;
  task_date: string;
  task_type: string;
  title: string;
  description: string | null;
  course_id: string | null;
  topic_id: string | null;
  // Populated from the separate task_resources join table (0032) -- N
  // resources per task, not a column on this row.
  resource_ids: string[];
  status: "pending" | "done" | "half_done" | "not_done";
  completed: boolean;
  is_coach_assigned: boolean;
  is_approved_by_coach: boolean;
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
  video_links: VideoLink[];
  order_index: number;
  is_locked: boolean;
  subject_scores: Record<string, { correct: number | null; wrong: number | null; empty: number | null }> | null;
  analysis_pending: boolean;
  // Kanıt Fotoğrafı: Storage paths of the photos the student attached (0087).
  evidence_image_paths?: string[];
};

export type DetailSession = {
  id: string;
  scheduled_at: string;
  outcome: "pending" | "completed" | "not_happened";
  evaluation_notes: string | null;
  missed_reason: "student_no_show" | "coach_no_show" | "other" | null;
  missed_reason_note: string | null;
  is_paid: boolean;
};

export type ParagrafProblemEntry = {
  id: string;
  entry_date: string;
  paragraf_dogru: number;
  paragraf_yanlis: number;
  paragraf_sure: number;
  problem_dogru: number;
  problem_yanlis: number;
  problem_sure: number;
};

// One lgs_daily_routines row (migration 0087): an LGS student's Paragraf
// session and Kitap Okuma page count for a day, each optional.
export type LgsDailyRoutine = {
  id: string;
  entry_date: string;
  paragraf_correct: number;
  paragraf_wrong: number;
  paragraf_empty: number;
  paragraf_duration_minutes: number | null;
  book_title: string | null;
  book_author: string | null;
  book_pages_read: number | null;
};

export type CompletionStats = {
  overall: number | null;
  tyt: number | null;
  ayt: number | null;
};

export type SubjectCompletion = {
  courseId: string;
  courseName: string;
  pct: number;
  done: number;
  total: number;
};

export type CoachNoteType = "main_session" | "check_in" | "parent_meeting";
export type ParentShareStatus = "none" | "pending" | "approved" | "rejected" | "revision_requested";

export type DetailCoachNote = {
  id: string;
  type: CoachNoteType;
  guardian_descriptor: string | null;
  content: string;
  created_at: string;
  parent_share_status: ParentShareStatus;
  admin_revision_note: string | null;
};

