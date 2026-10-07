import { addMinutes, isAfter, isBefore } from "date-fns";

// The time windows of a coaching meeting (görüşme), measured from its scheduled start -- one definition for the coach's banner
// and the student's card, so the two panels can never disagree about when a button is live.
//
//   - "Görüşmeye Katıl" is live from EXACTLY the start for exactly JOIN_WINDOW_MINUTES: start <= now < start + 10 min. Before the
//     start it is not active; once the window has passed it is gone.
//   - "Görüşme gerçekleşti mi?" (the coach's evaluation) only appears -- and can only be used -- once now > start + 30 min.
export const JOIN_WINDOW_MINUTES = 10;
export const CONFIRM_DELAY_MINUTES = 30;

export type MeetingJoinState = "before" | "open" | "closed";

export function meetingJoinState(scheduledAt: Date | string | number, now: Date | number): MeetingJoinState {
  const start = new Date(scheduledAt);
  if (isBefore(now, start)) return "before";
  return isBefore(now, addMinutes(start, JOIN_WINDOW_MINUTES)) ? "open" : "closed";
}

// Strictly after start + 30 minutes: at exactly 30:00 the question is still hidden.
export function canConfirmMeeting(scheduledAt: Date | string | number, now: Date | number): boolean {
  return isAfter(now, addMinutes(new Date(scheduledAt), CONFIRM_DELAY_MINUTES));
}

// When the evaluation opens, for the "available at HH:mm" hint.
export function confirmOpensAt(scheduledAt: Date | string | number): Date {
  return addMinutes(new Date(scheduledAt), CONFIRM_DELAY_MINUTES);
}
