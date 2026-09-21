import { mondayOf } from "./date";

// Program completion ("Tamamlama %") is time-aware: it only counts tasks the
// student can already have done -- from the start of the current weekly
// schedule (its Monday) up to and including today. A task scheduled for
// tomorrow or later is in neither the numerator nor the denominator, so a
// student who has finished everything due so far shows 100% on Monday instead
// of a discouraging 10% that only "fills up" as the week goes by.
//
// One rule shared by every surface that shows the percentage (coach student
// page, coach roster, parent weekly card) so they can never disagree.

export type CompletionTask = { task_date: string; status: string };

// The tasks counted right now: task_date between this week's Monday and today.
export function tasksDueSoFar<T extends { task_date: string }>(tasks: T[], todayIso: string): T[] {
  const weekStart = mondayOf(todayIso);
  return tasks.filter((t) => t.task_date >= weekStart && t.task_date <= todayIso);
}

export type CompletionCounts = { done: number; total: number };

export function completionCounts(tasks: CompletionTask[], todayIso: string): CompletionCounts {
  const due = tasksDueSoFar(tasks, todayIso);
  return { done: due.filter((t) => t.status === "done").length, total: due.length };
}

// Whole-number percent, or null when nothing has been due yet (no tasks up to
// today) -- shown as "—", never as 0% or 100%.
export function completionPercent(counts: CompletionCounts): number | null {
  return counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : null;
}
