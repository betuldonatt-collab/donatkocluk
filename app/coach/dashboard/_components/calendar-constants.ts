export const RANGE_START_HOUR = 7;
// Exclusive upper bound -- the grid covers 07:00 through 23:59, i.e. hour
// labels/gridlines run 7..23 and the last selectable slot is 23:30.
export const RANGE_END_HOUR = 24;
export const PX_PER_HOUR = 56;

export function minutesSinceRangeStart(isoString: string) {
  const d = new Date(isoString);
  return (d.getHours() - RANGE_START_HOUR) * 60 + d.getMinutes();
}

export function topPx(isoString: string) {
  return (minutesSinceRangeStart(isoString) / 60) * PX_PER_HOUR;
}

export function heightPx(startIso: string, endIso: string) {
  const minutes = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
  return Math.max((minutes / 60) * PX_PER_HOUR, 20);
}

export function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// Snaps a Y offset within the grid to the nearest 30 minutes, returning
// {hour, minute} in the coach's local time.
export function snapToSlot(offsetY: number) {
  const rawMinutes = RANGE_START_HOUR * 60 + (offsetY / PX_PER_HOUR) * 60;
  const snapped = Math.round(rawMinutes / 30) * 30;
  const clamped = Math.min(Math.max(snapped, RANGE_START_HOUR * 60), RANGE_END_HOUR * 60 - 30);
  return { hour: Math.floor(clamped / 60), minute: clamped % 60 };
}
