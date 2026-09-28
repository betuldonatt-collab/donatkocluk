// Program completion ("Tamamlama %") is scoped to the student's own coaching
// cycle -- the stretch between two coach "kilitle" (lock) actions -- not a
// fixed Monday-Sunday calendar week. The window for what's currently due is
// [the lock day itself, today] -- NOT the day after: a coach typically locks
// DURING a same-day session and, in that same sitting, assigns new tasks for
// that same day. Starting the new cycle the day after would silently drop
// those same-day tasks into the cycle just closed instead of the one they
// were actually assigned for. A student who has never been locked yet uses
// the day of their first COMPLETED coaching session as day one instead
// (there is nothing to lock before a first session happens).
//
// A student with neither a lock nor a completed session yet -- e.g. their
// very first appointment has just been scheduled but hasn't happened, or
// they're brand new -- has no real anchor at all. In that case `currentStart`
// is null, and every function here treats null as "no lower bound", not "no
// window": the current cycle is simply their whole history to date, same as
// the separately-computed all-time "Genel" figure. This was a deliberate
// choice (over e.g. account-creation date or first-assigned-task date):
// scheduling a student's first-ever session must never make their prior task
// history disappear from the percentage the moment they're excited to start
// tracking it, and it needs no extra data source to get right. The instant a
// real anchor exists (a completed session or a lock), it takes over exactly
// as before.
//
// One rule shared by every surface that shows the percentage (student
// board, coach student page, coach roster, parent panel) so they never
// disagree. See migration 0103_session_progress_locks.sql for the DB side
// (progress_locks replaces week_locks; the RLS freeze on student edits keys
// off the same boundary -- STRICTLY BEFORE the lock day, so the lock day's
// own tasks stay editable as part of the new cycle -- not an ISO week).

export type CompletionTask = { task_date: string; status: string };
export type CompletionCounts = { done: number; total: number };

// The two columns of the single most recent progress_locks row for a
// student -- everything resolveCycles needs, and everything a caller has to
// fetch to compute it (see app/coach/actions.ts's lockCurrentCycle, which
// writes exactly this shape).
export type ProgressLock = { period_start: string; locked_at: string };

// Dates are UTC calendar days, like every "today" in this app.
function dayOf(timestampOrDate: string): string {
  return timestampOrDate.slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Where the student's CURRENT (still open) cycle starts, and the fixed
// [start, end] range of their most recently CLOSED cycle, if any -- both
// derived from the same single latest lock row so every caller agrees. The
// lock day itself belongs to the NEW cycle (see the file header comment),
// so the closed cycle's end is the day BEFORE the lock, not the lock day.
export function resolveCycles(
  lastLock: ProgressLock | null,
  firstCompletedSessionAt: string | null,
): { currentStart: string | null; previousCycle: { start: string; end: string } | null } {
  if (lastLock) {
    const lockDay = dayOf(lastLock.locked_at);
    return {
      currentStart: lockDay,
      previousCycle: { start: lastLock.period_start, end: addDaysISO(lockDay, -1) },
    };
  }
  return {
    currentStart: firstCompletedSessionAt ? dayOf(firstCompletedSessionAt) : null,
    previousCycle: null,
  };
}

// The tasks counted right now: from the current cycle's start through today.
// No cycleStart at all (see the file header comment) means no lower bound --
// every task up to today counts, not none of them.
export function tasksDueSoFar<T extends { task_date: string }>(tasks: T[], todayIso: string, cycleStart: string | null): T[] {
  return tasks.filter((t) => (cycleStart === null || t.task_date >= cycleStart) && t.task_date <= todayIso);
}

export function completionCounts(tasks: CompletionTask[], todayIso: string, cycleStart: string | null): CompletionCounts {
  const due = tasksDueSoFar(tasks, todayIso, cycleStart);
  return { done: due.filter((t) => t.status === "done").length, total: due.length };
}

// Fixed-range counts for a cycle that has ALREADY been closed by a lock --
// both bounds are already in the past, so every task in [start, end] counts,
// no "due so far" capping needed. Used for the previous-cycle comparison bar.
export function closedCycleCounts(tasks: CompletionTask[], start: string, end: string): CompletionCounts {
  const due = tasks.filter((t) => t.task_date >= start && t.task_date <= end);
  return { done: due.filter((t) => t.status === "done").length, total: due.length };
}

// Whole-number percent, or null when nothing has been due yet (no tasks up to
// today) -- shown as "—", never as 0% or 100%.
export function completionPercent(counts: CompletionCounts): number | null {
  return counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : null;
}
