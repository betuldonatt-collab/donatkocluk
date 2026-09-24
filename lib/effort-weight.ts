import { completionStart, type CompletionCounts } from "./completion";
import { weekDates } from "./date";

// Effort-based task weighting behind every progress bar.
//
// A task's weight is "effort units" derived from what it asks of the
// student, so 20 paragraph questions and 50 geometry questions no longer
// count as equal "one task each". Units are internal only -- the UI never
// shows them, just the resulting percentage (see impactPercent).
//
//   Verbal / social / language ........ 1.0x  ->  10 units per question
//   Science (fizik/kimya/biyoloji/fen)  1.5x  ->  15 units per question
//   Math / geometry / problem ......... 2.0x  ->  20 units per question
//   Video / konu çalışması ............ 5 units per minute (coach's
//                                       duration, else 30 min = 150)
//   Branş denemesi .................... questions x coefficient + a small
//                                       format bonus
//   Genel deneme ...................... fixed milestone (large)
//
// Anything with no usable amount (older rows, blank counts) falls back to
// DEFAULT_TASK_UNITS instead of 0 or NaN, so legacy records still count.

export const UNITS_PER_QUESTION = 10;
export const UNITS_PER_MINUTE = 5;
export const DEFAULT_DURATION_MINUTES = 30;
export const DEFAULT_TASK_UNITS = DEFAULT_DURATION_MINUTES * UNITS_PER_MINUTE; // 150
export const BRANCH_EXAM_FORMAT_BONUS = 20;
export const DEFAULT_BRANCH_EXAM_QUESTIONS = 20;
export const GENERAL_EXAM_UNITS_YKS = 1200;
export const GENERAL_EXAM_UNITS_LGS = 900;

export type WeightableTask = {
  task_date: string;
  status: string;
  task_type?: string | null;
  course_id?: string | null;
  title?: string | null;
  total_count?: number | null;
  duration_minutes?: number | null;
};

export function subjectCoefficient(courseId: string | null | undefined): 1 | 1.5 | 2 {
  const id = courseId ?? "";
  if (/matematik|geometri/.test(id) || id === "problem" || id === "yeni-nesil-mat-dozu") return 2;
  if (/fizik|kimya|biyoloji|fen/.test(id)) return 1.5;
  return 1;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function minutesUnits(minutes: number | null | undefined): number {
  return (positive(minutes) ? minutes : DEFAULT_DURATION_MINUTES) * UNITS_PER_MINUTE;
}

export function taskWeight(t: Partial<Omit<WeightableTask, "task_date" | "status">>): number {
  const coef = subjectCoefficient(t.course_id);

  switch (t.task_type) {
    case "general_exam":
      return /^LGS/i.test(t.title ?? "") ? GENERAL_EXAM_UNITS_LGS : GENERAL_EXAM_UNITS_YKS;
    case "branch_exam": {
      const questions = positive(t.total_count) ? t.total_count : DEFAULT_BRANCH_EXAM_QUESTIONS;
      return Math.round(questions * UNITS_PER_QUESTION * coef + BRANCH_EXAM_FORMAT_BONUS);
    }
    case "video":
    case "topic_study":
    case "reading":
      return Math.round(minutesUnits(t.duration_minutes));
    default: {
      // question_bank, extra_custom and the routine tasks (paragraf,
      // problem, yeni nesil...): question count when there is one, else
      // a duration if the coach/student gave one, else the default.
      if (t.course_id === "kitap-okuma") return Math.round(minutesUnits(t.duration_minutes));
      if (positive(t.total_count)) return Math.round(t.total_count * UNITS_PER_QUESTION * coef);
      if (positive(t.duration_minutes)) return Math.round(t.duration_minutes * UNITS_PER_MINUTE);
      return DEFAULT_TASK_UNITS;
    }
  }
}

function sum(tasks: WeightableTask[]): CompletionCounts {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    const w = taskWeight(t);
    total += w;
    if (t.status === "done") done += w;
  }
  return { done, total };
}

// Weighted twins of completion.ts's completionCounts / weekCompletionCounts
// (same window rules, same lock-day start); done/total are effort units.
export function weightedCompletionCounts(tasks: WeightableTask[], todayIso: string, lockedAt?: string | null): CompletionCounts {
  const start = completionStart(todayIso, lockedAt);
  return sum(tasks.filter((t) => t.task_date >= start && t.task_date <= todayIso));
}

export function weightedWeekCompletionCounts(tasks: WeightableTask[], todayIso: string, lockedAt?: string | null): CompletionCounts {
  const start = completionStart(todayIso, lockedAt);
  const end = weekDates(todayIso)[6];
  return sum(tasks.filter((t) => t.task_date >= start && t.task_date <= end));
}

export function weightedDayCounts(tasks: WeightableTask[], dateIso: string): CompletionCounts {
  return sum(tasks.filter((t) => t.task_date === dateIso));
}

// How much finishing `task` moves its day's bar, as a whole percent
// (>= 1 when it counts for anything). Null when the day has no weight.
export function impactPercent(task: WeightableTask, dayTasks: WeightableTask[]): number | null {
  const total = dayTasks.reduce((acc, t) => acc + taskWeight(t), 0);
  if (total <= 0) return null;
  return Math.max(1, Math.round((taskWeight(task) / total) * 100));
}
