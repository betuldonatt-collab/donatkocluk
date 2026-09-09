// Shared staleness rule for "is this student's focus timer running right
// now" -- used identically by the coach dashboard widget and the
// /coach/stopwatch table so the two surfaces never disagree. The
// client sends a heartbeat every 20s while the timer is actually
// running (see sendFocusHeartbeat in app/student/actions.ts); 45s gives
// margin for one missed beat (a throttled background tab, a brief
// network hiccup) before flipping back to idle.
export const LIVE_STATUS_STALE_MS = 45_000;

export function isLiveNow(heartbeatAt: string | null, now: number): boolean {
  if (!heartbeatAt) return false;
  return now - new Date(heartbeatAt).getTime() < LIVE_STATUS_STALE_MS;
}
