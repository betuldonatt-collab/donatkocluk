// Period handling for the unified Karne: which date range is being looked at, the quick presets, and URL parameter validation.
// Pure (the page passes "today" in), so the rules are testable and the same on every panel.

import { addDaysISO, inclusiveDays } from "./karne-summary";

export type KarnePeriod = { from: string; to: string };

// A report card covers at most a year, and its end may reach a little into the future (a cycle that is still running).
export const MAX_PERIOD_DAYS = 366;
export const MAX_FUTURE_DAYS = 62;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Validates `?from=&to=`: both real dates, in order, not longer than a year, not more than ~2 months ahead. Anything else is null and
// the page falls back to its default period -- a hand-edited URL never breaks the page or asks the database for an absurd range.
export function parsePeriod(from: unknown, to: unknown, today: string): KarnePeriod | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  if (from > to) return null;
  if (inclusiveDays(from, to) > MAX_PERIOD_DAYS) return null;
  if (to > addDaysISO(today, MAX_FUTURE_DAYS)) return null;
  return { from, to };
}

export function samePeriod(a: KarnePeriod | null, b: KarnePeriod | null): boolean {
  return !!a && !!b && a.from === b.from && a.to === b.to;
}

export type PeriodPreset = { key: string; label: string; period: KarnePeriod };

export function presetPeriods(today: string): PeriodPreset[] {
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthEnd = addDaysISO(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
  return [
    { key: "last28", label: "Son 28 gün", period: { from: addDaysISO(today, -27), to: today } },
    { key: "thisMonth", label: "Bu ay", period: { from: monthStart, to: today } },
    { key: "lastMonth", label: "Geçen ay", period: { from: prevMonthStart, to: prevMonthEnd } },
  ];
}

const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// "01 Eki – 28 Eki 2026" (the year once, when both ends share it).
export function formatPeriod(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const d = (x: Date) => `${String(x.getUTCDate()).padStart(2, "0")} ${TR_MONTHS_SHORT[x.getUTCMonth()]}`;
  if (f.getUTCFullYear() === t.getUTCFullYear()) return `${d(f)} – ${d(t)} ${t.getUTCFullYear()}`;
  return `${d(f)} ${f.getUTCFullYear()} – ${d(t)} ${t.getUTCFullYear()}`;
}

export function monthLabel(dateIso: string): string {
  return TR_MONTHS_SHORT[new Date(`${dateIso}T00:00:00Z`).getUTCMonth()];
}
