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

export type TaskDuration = { tracked_duration_minutes: number };

// Sums actual Focus Timer tracked minutes across a set of tasks -- NOT
// duration_minutes, which is a coach's (or a student's own) assigned
// TARGET, not time actually spent. tracked_duration_minutes only ever
// grows via a real Süre Tut session (endFocusSession/end_focus_session,
// app/student/actions.ts), so "Toplam Süre" reflects time genuinely
// tracked, never an unstarted target. Same sharing rationale as
// sumTaskCounts above (student's task-board.tsx today; available for the
// coach's schedule-board.tsx to reuse later without risking the two panels
// drifting on identical data).
export function sumTaskDuration(tasks: TaskDuration[]): number {
  return tasks.reduce((sum, t) => sum + t.tracked_duration_minutes, 0);
}

// LGS's negative marking is 3 wrong = 1 right (YKS's computeNet above is
// 4:1) -- a separate function rather than a parameter, so a call site can
// never silently apply the wrong cohort's rule by forgetting an argument.
export function computeLgsNet(dogru: number, yanlis: number) {
  return Math.round((dogru - yanlis / 3) * 100) / 100;
}
