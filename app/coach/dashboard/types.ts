export type SessionOutcome = "pending" | "completed" | "not_happened";
export type MissedReason = "student_no_show" | "coach_no_show" | "other";

export type CoachingSession = {
  id: string;
  student_id: string;
  coach_id: string;
  scheduled_at: string;
  meeting_url: string | null;
  outcome: SessionOutcome;
  evaluation_notes: string | null;
  missed_reason: MissedReason | null;
  missed_reason_note: string | null;
  student_rating: number | null;
  student_feedback: string | null;
  rated_at: string | null;
  is_paid: boolean;
};

export type CalendarBlock = {
  id: string;
  coach_id: string;
  title: string;
  start_at: string;
  end_at: string;
};

export type CoachTaskStatus = "pending" | "done" | "not_done" | "message_sent";
export type CoachTaskSource = "manual" | "admin_assigned" | "automation";

export type CoachTask = {
  id: string;
  coach_id: string;
  student_id: string | null;
  task_date: string;
  title: string;
  description: string | null;
  source: CoachTaskSource;
  status: CoachTaskStatus;
  order_index: number;
  rolled_over_from: string | null;
  postponed_count: number;
};

export type RosterStudent = {
  id: string;
  full_name: string | null;
};

export type InactiveAlert = { student: RosterStudent };
export type LowPerformanceAlert = { student: RosterStudent; completionPct: number; doneCount: number; totalCount: number };
export type MissingExamAlert = {
  student: RosterStudent;
  taskId: string;
  title: string;
  taskDate: string;
  taskType: "general_exam" | "branch_exam";
};
export type EmptyProgramAlert = { student: RosterStudent };
export type PendingReportCardAlert = {
  student: RosterStudent;
  reportCardId: string;
  cycleNumber: number;
  generatedAt: string;
};
export type RsvpDeclineAlert = {
  student: RosterStudent;
  rsvpId: string;
  announcementTitle: string;
  declineReason: string | null;
};

export type CoachAlerts = {
  inactive: InactiveAlert[];
  lowPerformance: LowPerformanceAlert[];
  missingExams: MissingExamAlert[];
  emptyPrograms: EmptyProgramAlert[];
  pendingReportCards: PendingReportCardAlert[];
  rsvpDeclines: RsvpDeclineAlert[];
};

export const COACH_TASK_STATUS_LABELS: Record<CoachTaskStatus, string> = {
  pending: "Bekliyor",
  done: "Yapıldı",
  not_done: "Yapılmadı",
  message_sent: "Mesaj Atıldı",
};

export const MISSED_REASON_LABELS: Record<MissedReason, string> = {
  student_no_show: "Öğrencim görüşmeye gelmedi",
  coach_no_show: "Ben görüşmeye katılmadım",
  other: "Diğer",
};

