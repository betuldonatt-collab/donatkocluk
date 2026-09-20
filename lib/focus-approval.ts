// A single Süre Tut session longer than this is not credited straight away: it
// waits for the student's coach to approve, reduce or reject it (table
// focus_session_reviews, migration 0086). The database function
// end_focus_session applies the SAME limit (21600 s) -- keep the two in sync.
export const FOCUS_APPROVAL_THRESHOLD_SECONDS = 6 * 60 * 60;

export function needsCoachApproval(seconds: number): boolean {
  return seconds > FOCUS_APPROVAL_THRESHOLD_SECONDS;
}

export type FocusReviewStatus = "pending" | "approved" | "rejected";

// "14 sa 12 dk", "45 dk", "3 sa".
export function formatFocusDuration(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} dk`;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

// What a coach may credit when approving: a whole number of minutes between 1
// and what was recorded (rounded down so it can never exceed it). Returns the
// seconds to send, or null when the input isn't valid.
export function creditedSecondsFromMinutes(minutes: number, recordedSeconds: number): number | null {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 1) return null;
  const seconds = minutes * 60;
  if (seconds > recordedSeconds) return null;
  return seconds;
}
