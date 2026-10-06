// "Toplu İşlem" on the coach's weekly board: unfinished tasks are copied to a new date in one go. The originals are
// never deleted -- they stay on their day, marked "Ertelendi" (student_tasks.postponed_to, migration 0127) so the
// coach can see at a glance that they were handed out again.
//
// "Ertelendi" is a flag on top of the existing status rather than a new task_status label: every completion rate,
// topic stat, Karne and alert in the app keys off the four statuses, and a postponed task is still a task that was not
// done on its day, so it keeps counting as one.

export const MAX_TRANSFER_TASKS = 100;

export type TransferCandidate = { status: string; postponed_to?: string | null };

// A finished task has nothing to hand out again, and a task that was already postponed has its copy waiting on the new
// date (copying it again would duplicate the work).
export function isTransferable(task: TransferCandidate): boolean {
  return task.status !== "done" && !task.postponed_to;
}

// A task nobody has marked yet becomes "Yapılmadı" when it is postponed (it was not done on its day); one the student
// partly did ("Yarım Yapıldı") keeps its status, since the work and its D/Y/B results already count.
export function statusWhenPostponed(status: string): string {
  return status === "pending" ? "not_done" : status;
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// "2026-10-14" -> "14 Eki"
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1] ?? ""}`.trim();
}

// The badge text on a postponed card; null once the task is done after all (the badge would contradict the green border).
export function postponedLabel(task: { status: string; postponed_to?: string | null }): string | null {
  if (!task.postponed_to || task.status === "done") return null;
  return `Ertelendi → ${formatShortDate(task.postponed_to)}`;
}
