// Which DEVICE a running Süre Tut session belongs to, as far as this browser
// knows. The server keeps one row per (student, task) with no device column, so
// each browser remembers the sessions IT started or resumed (localStorage).
// A running session on the server that this browser has no record of is
// "somewhere else" -- another phone, tablet or browser -- and the student is
// asked what to do with it instead of it being closed or silently shown.
//
// Best-effort and harmless when storage is unavailable (private mode, cleared
// data): the worst case is one unnecessary "Farklı bir cihazda..." question.

const OWNER_PREFIX = "focus-owner:";
const KEPT_PREFIX = "focus-keep-running:";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// This browser started or resumed the session for `taskId`.
export function markOwner(taskId: string): void {
  safe(() => window.localStorage.setItem(OWNER_PREFIX + taskId, String(Date.now())), undefined);
  clearKeepRunning(taskId);
}

export function clearOwner(taskId: string): void {
  safe(() => window.localStorage.removeItem(OWNER_PREFIX + taskId), undefined);
  clearKeepRunning(taskId);
}

// A marker older than a day is stale (the session it belonged to was ended
// from another device long ago), so it no longer counts.
const OWNER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isOwner(taskId: string): boolean {
  return safe(() => {
    const stamp = Number(window.localStorage.getItem(OWNER_PREFIX + taskId));
    return Number.isFinite(stamp) && stamp > 0 && Date.now() - stamp < OWNER_MAX_AGE_MS;
  }, false);
}

// The student answered "Çalışmaya devam etsin" to the question: don't ask again
// in this tab session.
export function markKeepRunning(taskId: string): void {
  safe(() => window.sessionStorage.setItem(KEPT_PREFIX + taskId, "1"), undefined);
}

export function isKeepRunning(taskId: string): boolean {
  return safe(() => window.sessionStorage.getItem(KEPT_PREFIX + taskId) !== null, false);
}

export function clearKeepRunning(taskId: string): void {
  safe(() => window.sessionStorage.removeItem(KEPT_PREFIX + taskId), undefined);
}

// A running session this browser did not start and the student has not
// already said to leave alone.
export function needsOtherDeviceQuestion(taskId: string): boolean {
  return !isOwner(taskId) && !isKeepRunning(taskId);
}

export const OTHER_DEVICE_QUESTION = "Farklı bir cihazda devam eden bir süreniz var, durdurmak ister misiniz?";
