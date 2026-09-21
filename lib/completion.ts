import { mondayOf } from "./date";

// Program completion ("Tamamlama %") is time-aware: it only counts tasks the
// student can already have done -- from the day the coach LOCKED the current
// weekly schedule up to and including today. A task scheduled for tomorrow or
// later is in neither the numerator nor the denominator, so a student who has
// finished everything due so far shows 100% instead of a discouraging number that
// only "fills up" as the week goes by.
//
// The start is the lock day itself (week_locks.locked_at), not Monday. A week
// that has not been locked yet has no lock day, so it falls back to the week's
// Monday -- the schedule is still being worked, and the percentage has to mean
// something in the meantime. (A lock that predates the week, e.g. locked the
// Sunday before, still starts at Monday: tasks cannot be due before their week.)
//
// One rule shared by every surface that shows the percentage (student board,
// coach student page, coach roster, parent weekly card) so they never disagree.

export type CompletionTask = { task_date: string; status: string };

// Dates are UTC calendar days, like every "today" in this app.
function dayOf(timestampOrDate: string): string {
  return timestampOrDate.slice(0, 10);
}

// The first day that counts. `lockedAt` is the current week's week_locks.locked_at
// (a timestamp or a date), or null/undefined when the week is not locked.
export function completionStart(todayIso: string, lockedAt?: string | null): string {
  const weekStart = mondayOf(todayIso);
  if (!lockedAt) return weekStart;
  const lockDay = dayOf(lockedAt);
  return lockDay > weekStart ? lockDay : weekStart;
}

// The tasks counted right now: from the start above through today.
export function tasksDueSoFar<T extends { task_date: string }>(tasks: T[], todayIso: string, lockedAt?: string | null): T[] {
  const start = completionStart(todayIso, lockedAt);
  return tasks.filter((t) => t.task_date >= start && t.task_date <= todayIso);
}

export type CompletionCounts = { done: number; total: number };

export function completionCounts(tasks: CompletionTask[], todayIso: string, lockedAt?: string | null): CompletionCounts {
  const due = tasksDueSoFar(tasks, todayIso, lockedAt);
  return { done: due.filter((t) => t.status === "done").length, total: due.length };
}

// Whole-number percent, or null when nothing has been due yet (no tasks up to
// today) -- shown as "—", never as 0% or 100%.
export function completionPercent(counts: CompletionCounts): number | null {
  return counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : null;
}
