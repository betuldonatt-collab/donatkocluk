// What the coach's lock button on the schedule board shows.
//
// A lock freezes everything BEFORE the lock day (the lock day itself belongs to the new, open cycle -- lib/completion.ts). The old button looked
// only at whether the displayed week lies entirely before the lock day, so on the current week -- where a lock made today leaves today and the
// days ahead in view -- it never flipped to "Kilidi Aç": the lock WAS saved, the board just kept offering "Programı Kilitle", and pressing it
// again answered "Program bugün zaten kilitlendi.". Looking at a past week, the same lock did flip the button -- hence "sometimes".
//
// `lockedThroughDate`: the day of the latest lock (null = never locked). `today`: the board's today (UTC date, like the server's).
// `weekEnd`: the last day of the displayed window.
export type LockButtonState = {
  // The displayed window is entirely frozen (shows the banner).
  weekFrozen: boolean;
  // The latest lock was made today (so it can be undone from any window).
  lockedToday: boolean;
  // The button offers "Kilidi Aç" (undo the latest lock) instead of "Programı Kilitle / Değerlendir".
  showUnlock: boolean;
};

export function lockButtonState(input: { lockedThroughDate: string | null; today: string; weekEnd: string }): LockButtonState {
  const { lockedThroughDate, today, weekEnd } = input;
  const weekFrozen = lockedThroughDate !== null && weekEnd < lockedThroughDate;
  const lockedToday = lockedThroughDate !== null && lockedThroughDate === today;
  return { weekFrozen, lockedToday, showUnlock: weekFrozen || lockedToday };
}
