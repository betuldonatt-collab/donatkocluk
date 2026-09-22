// Paragraf ve Problem Çizelgesi: a day can now hold several
// paragraf_problem_entries rows for the same date -- the manual form already
// allowed logging more than one session a day, and auto-syncing a routine task
// per completion (see migration 0091) makes that routine rather than rare. The
// chart and the history table both read one point per DAY, so every reader
// sums same-date rows together first instead of plotting (or listing) each one
// separately, which is what this function does; net is then recomputed from
// the summed doğru/yanlış, never summed itself (summing two already-rounded
// nets can drift from the net of the summed counts).

export type ParagrafProblemCounts = { dogru: number; yanlis: number; bos: number; sure: number };
export type ParagrafProblemDay = { date: string; paragraf: ParagrafProblemCounts; problem: ParagrafProblemCounts };

const EMPTY_COUNTS: ParagrafProblemCounts = { dogru: 0, yanlis: 0, bos: 0, sure: 0 };

function addCounts(a: ParagrafProblemCounts, b: ParagrafProblemCounts): ParagrafProblemCounts {
  return { dogru: a.dogru + b.dogru, yanlis: a.yanlis + b.yanlis, bos: a.bos + b.bos, sure: a.sure + b.sure };
}

// Sums every row sharing a date into one, in ascending date order -- ready to
// feed straight into a chart's x-axis or a "Geçmiş Veriler" table without a
// second same-day point ever appearing.
export function aggregateParagrafProblemByDate(rows: ParagrafProblemDay[]): ParagrafProblemDay[] {
  const byDate = new Map<string, ParagrafProblemDay>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    byDate.set(
      row.date,
      existing
        ? { date: row.date, paragraf: addCounts(existing.paragraf, row.paragraf), problem: addCounts(existing.problem, row.problem) }
        : { date: row.date, paragraf: { ...EMPTY_COUNTS, ...row.paragraf }, problem: { ...EMPTY_COUNTS, ...row.problem } },
    );
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
