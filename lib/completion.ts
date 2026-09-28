// Program completion ("Tamamlama %") is scoped to the student's own coaching
// cycle -- the stretch between two coach "kilitle" (lock) actions -- not a
// fixed Monday-Sunday calendar week. The window for what's currently due is
// [the lock day itself, today] -- NOT the day after: a coach typically locks
// DURING a same-day session and, in that same sitting, assigns new tasks for
// that same day. Starting the new cycle the day after would silently drop
// those same-day tasks into the cycle just closed instead of the one they
// were actually assigned for. A student who has never been locked yet uses
// the day of their first COMPLETED coaching session as day one instead
// (there is nothing to lock before a first session happens); its own
// "previous" comparison window is the 14-to-7-days-before range immediately
// preceding that first session, same formula as the bootstrap case below.
//
// A student with neither a lock nor a completed session yet -- e.g. their
// very first appointment has just been scheduled but hasn't happened -- has
// no real cycle event to anchor on at all. Coaches evaluate a student every
// ~4 weeks, so rather than either hiding everything (an empty window) or
// pulling in their entire history (unbounded), this anchors on the date of
// their upcoming (pending) session -- T -- and shows exactly the two
// 7-day windows leading up to it: [T-7, T] as the current period, [T-14,
// T-7] as the previous one. No pending session at all (a genuinely brand
// new student) falls back to T = today. The instant a real cycle event
// exists (a completed session or a lock), it takes over exactly as before.
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

// A fixed [start, end] date range, both bounds inclusive -- what every
// surface actually displays and counts against, current or previous alike.
export type CycleWindow = { start: string; end: string };

// Dates are UTC calendar days, like every "today" in this app.
function dayOf(timestampOrDate: string): string {
  return timestampOrDate.slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The student's current (still open) cycle window and their previous
// (already closed) one -- both always real, displayable date ranges; there
// is no more "no window" or "unbounded" case. `upcomingSessionAt` is that
// student's soonest still-pending coaching session, if any (only consulted
// when there is neither a lock nor a completed session yet).
export function resolveCycles(
  lastLock: ProgressLock | null,
  firstCompletedSessionAt: string | null,
  upcomingSessionAt: string | null,
  todayIso: string,
): { current: CycleWindow; previous: CycleWindow } {
  if (lastLock) {
    const lockDay = dayOf(lastLock.locked_at);
    return {
      current: { start: lockDay, end: todayIso },
      previous: { start: lastLock.period_start, end: addDaysISO(lockDay, -1) },
    };
  }
  if (firstCompletedSessionAt) {
    const start = dayOf(firstCompletedSessionAt);
    return {
      current: { start, end: todayIso },
      previous: { start: addDaysISO(start, -14), end: addDaysISO(start, -7) },
    };
  }
  const anchor = upcomingSessionAt ? dayOf(upcomingSessionAt) : todayIso;
  return {
    current: { start: addDaysISO(anchor, -7), end: anchor },
    previous: { start: addDaysISO(anchor, -14), end: addDaysISO(anchor, -7) },
  };
}

// Every task within a fixed [start, end] window -- used both for the plain
// done/total count (closedCycleCounts below) and for callers that need the
// raw rows to bucket further (e.g. the coach's TYT/AYT/per-course splits).
export function tasksInCycle<T extends { task_date: string }>(tasks: T[], window: CycleWindow): T[] {
  return tasks.filter((t) => t.task_date >= window.start && t.task_date <= window.end);
}

export function closedCycleCounts(tasks: CompletionTask[], window: CycleWindow): CompletionCounts {
  const due = tasksInCycle(tasks, window);
  return { done: due.filter((t) => t.status === "done").length, total: due.length };
}

// Whole-number percent, or null when nothing has been due yet (no tasks in
// the window) -- shown as "—", never as 0% or 100%.
export function completionPercent(counts: CompletionCounts): number | null {
  return counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : null;
}
