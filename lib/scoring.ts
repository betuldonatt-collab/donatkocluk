// Shared by client forms and server actions so a paragraf/problem net score
// is always derived the same way, never stored (and never able to drift
// from its doğru/yanlış inputs).
export function computeNet(dogru: number, yanlis: number) {
  return Math.round((dogru - yanlis / 4) * 100) / 100;
}

export type TaskCounts = { correct_count: number | null; wrong_count: number | null; empty_count: number | null };

// Sums Doğru/Yanlış/Boş across a set of scored tasks -- used for the
// per-day and per-week DYB footers in both panels' weekly program views
// (app/student's task-board.tsx, app/coach's schedule-board.tsx). Tasks
// with no score at all (null counts, not yet done) contribute nothing
// rather than being coerced to 0 and counted as "attempted."
export function sumTaskCounts(tasks: TaskCounts[]): { correct: number; wrong: number; empty: number } {
  return tasks.reduce(
    (acc, t) => ({
      correct: acc.correct + (t.correct_count ?? 0),
      wrong: acc.wrong + (t.wrong_count ?? 0),
      empty: acc.empty + (t.empty_count ?? 0),
    }),
    { correct: 0, wrong: 0, empty: 0 },
  );
}

export type TaskDuration = { duration_minutes: number | null };

// Sums Focus Timer / manually-entered minutes across a set of tasks -- same
// sharing rationale as sumTaskCounts above (student's task-board.tsx today;
// available for the coach's schedule-board.tsx to reuse later without risking
// the two panels drifting on identical data).
export function sumTaskDuration(tasks: TaskDuration[]): number {
  return tasks.reduce((sum, t) => sum + (t.duration_minutes ?? 0), 0);
}
