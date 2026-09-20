// "Hâlâ çalışmaya devam ediyor musun?" -- the check-in a running Focus Timer
// asks for every STILL_STUDYING_INTERVAL_SECONDS of elapsed time (3h, 6h,
// 9h, ...). It replaces the old hard 3-hour behaviour: a session is NEVER
// stopped, truncated or discarded because it got long -- the timer just keeps
// counting and asks the student to confirm. What was studied is always
// credited in full; the only way time is ever trimmed is the student
// choosing to enter a shorter figure themselves.

export const STILL_STUDYING_INTERVAL_SECONDS = 3 * 60 * 60;

// How many full intervals have elapsed (0 before the first 3h).
export function confirmationMultiple(elapsedSeconds: number): number {
  return Math.floor(Math.max(0, elapsedSeconds) / STILL_STUDYING_INTERVAL_SECONDS);
}

// True when an interval boundary has been crossed that the student hasn't
// confirmed yet.
export function isConfirmationDue(elapsedSeconds: number, confirmedMultiple: number): boolean {
  const multiple = confirmationMultiple(elapsedSeconds);
  return multiple >= 1 && multiple > confirmedMultiple;
}

// Confirmations live in localStorage, per task, so a page reload or a
// remount (the fullscreen timer <-> the floating widget) doesn't re-ask
// about a boundary the student already answered. Cleared when a session
// starts or ends. Every access is guarded: storage can be unavailable
// (private windows, blocked site data) and the prompt must still work.
const key = (taskId: string) => `focus-confirmed:${taskId}`;

export function readConfirmedMultiple(taskId: string): number {
  try {
    const raw = window.localStorage.getItem(key(taskId));
    const parsed = raw === null ? 0 : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

export function writeConfirmedMultiple(taskId: string, multiple: number): void {
  try {
    window.localStorage.setItem(key(taskId), String(multiple));
  } catch {
    // Not persisted -- the prompt may be shown again after a reload; harmless.
  }
}

export function clearConfirmedMultiple(taskId: string): void {
  try {
    window.localStorage.removeItem(key(taskId));
  } catch {
    // Nothing to clear.
  }
}
