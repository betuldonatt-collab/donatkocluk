// Monday-through-Sunday week math, UTC-based to match week_start_of()
// (migration 0037) and every server-side "today" computation in this
// app. This exact dow===0?-6:1-dow calculation used to be reimplemented
// inline in ~14 files -- harmless while every copy agreed, but a future
// edge-case fix (DST-adjacent date, a locale change) had 14 independent
// places to apply it correctly. Consolidated here since it's pure
// computation, not UI -- the same category as lib/scoring.ts and
// lib/gelisim-haritasi.ts, which this codebase already shares rather
// than duplicates.
export function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

// The 7 ISO date strings (Monday..Sunday) for the week containing
// referenceIso. Callers that need per-day labels build their own
// {date, label} array on top of this -- the label text/format is
// presentational and stays local to whichever panel renders it, matching
// this app's convention of duplicating UI-adjacent bits per panel.
export function weekDates(referenceIso: string): string[] {
  const monday = mondayOf(referenceIso);
  const base = new Date(`${monday}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Kronometre Yarışması's "logical day" (migration 0079,
// get_daily_stopwatch_ranking) runs from 02:00 Turkey time (UTC+3, no
// DST) to 01:59:59 the next day, not literal UTC midnight like every
// other date in this app -- so a student still studying past midnight
// keeps contributing to what the leaderboard still treats as "today".
// 02:00 Turkey time is UTC 23:00 (of the preceding UTC calendar day), so
// shifting the clock forward 1 hour before taking the UTC date lands the
// rollover exactly there: at UTC 22:59 that's 23:59 the same UTC day
// (date unchanged, boundary not yet crossed); at UTC 23:01 that's 00:01
// the NEXT UTC day (date advances). This must stay byte-for-byte the
// same math as the SQL function's `(now() at time zone 'utc' + interval
// '1 hour')::date` -- used by fetchStopwatchCompetitionRoster
// (app/coach/actions.ts) so the coach's own roster totals never disagree
// with the student's own widget about what "today" means.
export function stopwatchLogicalDateIso(reference: Date = new Date()): string {
  const shifted = new Date(reference.getTime() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
