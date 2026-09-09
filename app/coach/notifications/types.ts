export type NotificationType =
  | "inactive_student"
  | "critical_completion_drop"
  | "success_completion"
  | "note_revision_requested"
  | "checklist_task_done"
  | "pending_task_approval";

export type NotificationStatus = "active" | "done";

export type CoachNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  status: NotificationStatus;
  created_at: string;
  done_at: string | null;
  student_id: string | null;
  studentName: string | null;
  // student_tasks.id for pending_task_approval -- null for every other
  // type. Lets syncPendingApprovalNotifications (app/coach/actions.ts)
  // auto-resolve a notification the moment its task is approved/deleted,
  // without needing the coach to separately dismiss it here too.
  reference_id: string | null;
};
