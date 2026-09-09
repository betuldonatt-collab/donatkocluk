// Shared, pure date-range logic for the Paragraf/Problem tracking charts on
// both the student and coach panels. Each panel keeps its own small picker
// UI (per this repo's per-panel-duplication convention) but both filter
// their already-fetched entries against the same ChartRange value produced
// here, so "Son 30 Gün" and a picked calendar range mean exactly the same
// thing on both sides.

// "last30" (rolling window ending today) or an exact calendar range picked
// from the Calendar UI, both endpoints inclusive.
export type ChartRange = { type: "last30" } | { type: "custom"; startDate: string; endDate: string };

export const LAST_30_DAYS_RANGE: ChartRange = { type: "last30" };

// "Today"/"N days ago" for the rolling last30 window -- UTC-based, matching
// this repo's existing todayISO()/addDaysISO() convention used elsewhere
// (e.g. lib/announcements.ts) for "now" rather than a user's own pick.
function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(now: Date) {
  return now.toISOString().slice(0, 10);
}

// Converters for the Calendar's own Date objects, deliberately using LOCAL
// date components (not toISOString()'s UTC conversion) -- a date the user
// deliberately clicked on the calendar must map to that exact calendar day
// regardless of timezone, unlike "today" above where the existing UTC-based
// convention is already accepted app-wide.
export function dateToISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Regex-shape AND real calendar-validity (rejects e.g. "2026-02-30" or
// "2026-13-01", which /^\d{4}-\d{2}-\d{2}$/ alone would happily accept)
// for a plain YYYY-MM-DD date-only string -- the single validation point
// for any date range that crosses the client/server boundary as a string
// rather than a Date object (Karne's custom range picker chief among
// them). Constructing with local Date components (not `new Date(iso)`,
// which parses as UTC midnight and can shift a calendar day backward in
// a negative-UTC-offset timezone) and checking the round-trip is what
// makes this immune to local-vs-UTC drift, matching dateToISO/isoToDate
// above's own reasoning exactly.
export function isValidISODateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function isDateInChartRange(dateISO: string, range: ChartRange, now: Date = new Date()): boolean {
  if (range.type === "last30") {
    const today = todayISO(now);
    return dateISO >= addDaysISO(today, -29) && dateISO <= today;
  }
  return dateISO >= range.startDate && dateISO <= range.endDate;
}

// Label for the picker's trigger button -- "Son 30 Gün" or e.g.
// "15 Ağu – 01 Eyl 2026" (year shown once, or on both ends when the range
// spans a year boundary).
export function formatChartRangeLabel(range: ChartRange): string {
  if (range.type === "last30") return "Son 30 Gün";
  const start = isoToDate(range.startDate);
  const end = isoToDate(range.endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = end.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}
