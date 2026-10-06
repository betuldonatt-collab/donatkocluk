// "Tamamlanmayan Görevler" on the coach's student detail page: past-due tasks
// the student never completed -- surfaced up front so the coach doesn't have
// to dig through the weekly board to notice a task with no photo / no answer.

// How far back the list looks. Older misses were already dealt with in past
// sessions; this keeps the card about what's actionable now.
// One week, everywhere (the student detail page's card and the coach dashboard's panel share this rule).
export const MISSING_TASKS_WINDOW_DAYS = 7;

export type MissingTaskReason = "no_photo" | "photo_rejected" | "not_done" | "incomplete";

export type MissingTaskInput = {
  id: string;
  task_date: string;
  task_type: string;
  course_id: string | null;
  status: string;
  is_approved_by_coach: boolean;
  evidence_image_paths?: string[] | null;
  evidence_review_status?: string | null;
  // Handed out again on a later date (migration 0127) -- already dealt with, never listed.
  postponed_to?: string | null;
};

export type MissingTask<T extends MissingTaskInput> = { task: T; reason: MissingTaskReason };

// Kitap Okuma is deliberately never listed (the coach asked for it to be
// excluded): task_type "reading" is the real task; the course id covers the
// routine pseudo-course form.
export function isKitapOkumaTask(task: Pick<MissingTaskInput, "task_type" | "course_id">): boolean {
  return task.task_type === "reading" || task.course_id === "kitap-okuma";
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// `requiresPhoto` is true for LGS students, the only cohort whose tasks need a
// Kanıt Fotoğrafı (lib/lgs-completion.ts) -- a vocab quiz never does.
export function findMissingTasks<T extends MissingTaskInput>(
  tasks: T[],
  today: string,
  options: { requiresPhoto: boolean; windowDays?: number },
): MissingTask<T>[] {
  const earliest = shiftIso(today, -(options.windowDays ?? MISSING_TASKS_WINDOW_DAYS));
  const result: MissingTask<T>[] = [];

  for (const task of tasks) {
    if (isKitapOkumaTask(task)) continue;
    // A self-created task the coach hasn't approved yet isn't theirs to chase.
    if (!task.is_approved_by_coach) continue;
    if (task.task_date >= today || task.task_date < earliest) continue;
    if (task.status === "done" || task.status === "half_done") continue;
    if (task.postponed_to) continue;
    // Photos sent and waiting for the coach: already in Onay Bekleyen.
    if (task.evidence_review_status === "pending") continue;

    const photoCount = task.evidence_image_paths?.length ?? 0;
    let reason: MissingTaskReason = "incomplete";
    if (task.evidence_review_status === "rejected" && photoCount > 0) reason = "photo_rejected";
    else if (options.requiresPhoto && task.task_type !== "vocab_quiz" && photoCount === 0) reason = "no_photo";
    else if (task.status === "not_done") reason = "not_done";
    result.push({ task, reason });
  }

  // Newest day first; within a day keep the board's own order.
  return result.sort((a, b) => (a.task.task_date < b.task.task_date ? 1 : a.task.task_date > b.task.task_date ? -1 : 0));
}

// Buckets an already newest-first list by day (order preserved), so a day's
// date is written once as a header instead of on every row.
export function groupMissingByDate<T extends { task_date: string }>(items: T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.task_date) last.items.push(item);
    else groups.push({ date: item.task_date, items: [item] });
  }
  return groups;
}
