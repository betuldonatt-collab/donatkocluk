// How far a coach's "Programı Kilitle" reaches.
//
// A lock is ONE boundary day per student: a task is frozen (the student cannot edit it) exactly when its date falls STRICTLY BEFORE the
// latest lock's day (database function is_task_locked, migration 0103; the same comparison lives in app/student/page.tsx, actions.ts and the
// coach board). The lock day itself, and every day after it, stays open. Nothing here ever locks a later day: the boundary is never after
// today, so future weeks are untouched by construction.
//
// What used to be wrong: the boundary was ALWAYS "today", whichever week the coach was looking at. Locking an older week froze everything up to
// today -- the weeks after the one on screen as well. Now the boundary follows the week on screen: the lock freezes the viewed week and every
// week before it, and nothing after (a week that includes today freezes everything before today; today and the days to come stay open).

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// The boundary day for a lock requested from a week whose last day is `throughDate` (inclusive): the day AFTER it, but never later than
// today. No `throughDate` = today (the whole past, as before).
export function lockBoundary(today: string, throughDate?: string | null): string {
  if (!throughDate) return today;
  const after = addDaysISO(throughDate, 1);
  return after < today ? after : today;
}

// Same comparison as the database (is_task_locked) and every screen: frozen = strictly before the lock day.
export function isTaskFrozen(taskDate: string, lockDay: string | null): boolean {
  return lockDay !== null && taskDate < lockDay;
}

export type LockPlan = {
  // The day stored as the lock's day (progress_locks.locked_at is that day).
  boundary: string;
  // The first day of the cycle this lock closes (progress_locks.period_start; always before the boundary).
  periodStart: string;
  // Untouched ("pending") tasks from periodStart through the day before the boundary are finalized as not done.
  finalizeFrom: string;
  finalizeTo: string;
  // The boundary is an earlier day than today: locked_at is written explicitly (otherwise it is "now").
  backdated: boolean;
};

export type LockPlanResult = { ok: true; plan: LockPlan } | { ok: false; error: string };

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// What a lock would do, or why it cannot be made. `lastLockDay` = the day of the student's latest lock (null = never locked).
export function planLock(input: { today: string; throughDate?: string | null; lastLockDay: string | null }): LockPlanResult {
  const { today, lastLockDay } = input;
  if (input.throughDate && !ISO_DAY.test(input.throughDate)) return { ok: false, error: "Geçersiz tarih." };
  const boundary = lockBoundary(today, input.throughDate);
  if (lastLockDay !== null && boundary <= lastLockDay) {
    // The lock day itself belongs to the open cycle, so two locks on one day would close an empty range.
    return {
      ok: false,
      error:
        boundary === today && lastLockDay === today
          ? "Program bugün zaten kilitlendi."
          : `Bu hafta zaten kilitli: program ${formatDay(lastLockDay)} tarihinden önceki günler için kilitli.`,
    };
  }
  // The first lock of a student has no earlier lock to start from: the same 7-day stretch the percentages use before any lock.
  const periodStart = lastLockDay ?? addDaysISO(boundary, -7);
  return {
    ok: true,
    plan: {
      boundary,
      periodStart,
      finalizeFrom: periodStart,
      finalizeTo: addDaysISO(boundary, -1),
      backdated: boundary < today,
    },
  };
}

// The last day a lock made from the week ending `weekEnd` freezes, for the confirmation text.
export function lockScopeEnd(weekEnd: string, today: string): string {
  return addDaysISO(lockBoundary(today, weekEnd), -1);
}
