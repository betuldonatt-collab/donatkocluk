import type { CompletionCounts, CycleWindow } from "./completion";
import { AUTO_STATUS_TOLERANCE, computeAutoTaskStatus, mergeDualTaskStatus, type DualPartStatus } from "./count-fields";
import { RESOURCE_REVIEW_TASK_TYPE } from "./task-types";

// Effort-based task weighting behind every progress bar.
//
// A task's weight is "effort units" derived from what it asks of the
// student, so 20 paragraph questions and 50 geometry questions no longer
// count as equal "one task each". Units are internal only -- the UI never
// shows them, just the resulting percentage (see impactPercent).
//
//   Verbal / social / language / biyoloji  1.0x  ->  10 units per question
//   Science (fizik/kimya/fen) ......... 1.5x  ->  15 units per question
//   Math / geometry / problem ......... 2.0x  ->  20 units per question
//   Video / konu çalışması / reading .. per MINUTE, by subject: verbal +
//                                       biyoloji 15 units/min (so 1 minute
//                                       = 1 science question); math, fizik,
//                                       kimya, fen and anything with no
//                                       subject 5 units/min. Duration is the
//                                       coach's, else 30 min.
//   Kaynak taraması (resource_review) . weighs exactly 1.5x the Soru Çözümü
//                                       it would be with the same course and
//                                       the same amount (question count,
//                                       else duration, else the default) --
//                                       a pure factor on top of the subject
//                                       coefficient, never instead of it.
//   Branş denemesi .................... questions x coefficient + a small
//                                       format bonus
//   Genel deneme ...................... fixed milestone (large)
//
// Anything with no usable amount (older rows, blank counts) falls back to
// DEFAULT_TASK_UNITS instead of 0 or NaN, so legacy records still count.
//
// PARTIAL CREDIT (2026-10-17, user decision) -- the one rule every percentage in the app shares (coach roster and student detail, parent,
// student board, Karne): the DENOMINATOR is every task's full weight whatever its status (the effort that was expected);
// the NUMERATOR is the share of that weight the status earned --
//   done ........ 100% (the 5-question tolerance of computeAutoTaskStatus already makes 35/40 "done")
//   half_done ... solved / target of its weight, where solved = Doğru + Yanlış + Boş and target = Toplam (total_count), capped at 100%:
//                 target 40, solved 25 -> 62.5% of the task's weight. No usable target or nothing solved -> 0.
//   not_done / pending ... 0
//
// A "KONU ÇALIŞMASI / VIDEO" TASK IS TWO TASKS IN ONE (2026-10-17, user decision). It can carry a study / video part (a time target,
// duration_minutes) AND a question part (a question target, total_count), each its own effort and each earning its own credit:
//   weight  = the study part's weight (minutes x the subject's units per minute) + the question part's weight (questions x 10 x the
//             subject's coefficient). A part that was not given weighs nothing; a task with neither is the 30-minute default.
//   credit  = study part x (done 100%, half done 50% STUDY_HALF_CREDIT, not done 0) per the student's OWN pick for that part
//             (study_status, see effectiveStudyStatus)  +  question part x the share of the question target solved (Doğru + Yanlış + Boş
//             over Toplam, 100% from "within the 5-question tolerance" up), whatever the overall status says.
//   So clicking "done" on the study part earns the study part only; solving all the questions without the video earns the question part
//   only; and nothing a student types in one part can pay for the other. (Soru Çözümü and Kaynak Taraması are ONE activity -- their time is
//   only the pace for the same questions -- so they keep the single-component rule above and are never summed.)

export const UNITS_PER_QUESTION = 10;
export const UNITS_PER_MINUTE = 5;
export const VERBAL_UNITS_PER_MINUTE = 15;
export const DEFAULT_DURATION_MINUTES = 30;
export const DEFAULT_TASK_UNITS = DEFAULT_DURATION_MINUTES * UNITS_PER_MINUTE; // 150
// Going back over missed / blank questions asks more of the student than solving fresh ones (2026-10-13, user decision).
export const RESOURCE_REVIEW_WEIGHT_MULTIPLIER = 1.5;
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
  // What a half_done task earns: the questions solved so far. Either the three counts (summed, like computeAutoTaskStatus does) or --
  // for a row that is sent to a browser that should not get the Doğru / Yanlış / Boş split -- the ready-made sum.
  correct_count?: number | null;
  wrong_count?: number | null;
  empty_count?: number | null;
  solved_count?: number | null;
  // Konu Çalışması / Video only: the student's own pick for the study / video part (done / half_done / not_done), kept apart from the
  // overall `status` (which merges it with the question counts). Null for older rows and for every other type.
  study_status?: string | null;
};

export function subjectCoefficient(courseId: string | null | undefined): 1 | 1.5 | 2 {
  const id = courseId ?? "";
  if (/matematik|geometri/.test(id) || id === "problem" || id === "yeni-nesil-mat-dozu") return 2;
  // Biyoloji is deliberately NOT here: it's weighed like a verbal subject.
  if (/fizik|kimya|fen/.test(id)) return 1.5;
  return 1;
}

// Study-time rate: verbal subjects and biyoloji (multiplier 1.0) earn 15
// units per minute; math/fizik/kimya/fen, and tasks with no subject at all
// (free-title extra work), keep the flat 5. Kitap okuma is a reading habit,
// not a subject, so it stays at 5 too.
function unitsPerMinute(courseId: string | null | undefined): number {
  if (!courseId || courseId === "kitap-okuma") return UNITS_PER_MINUTE;
  return subjectCoefficient(courseId) === 1 ? VERBAL_UNITS_PER_MINUTE : UNITS_PER_MINUTE;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function minutesUnits(minutes: number | null | undefined, courseId: string | null | undefined): number {
  return (positive(minutes) ? minutes : DEFAULT_DURATION_MINUTES) * unitsPerMinute(courseId);
}

const STUDY_TASK_TYPES = new Set(["topic_study", "video"]);
export const isStudyTask = (t: { task_type?: string | null }): boolean => !!t.task_type && STUDY_TASK_TYPES.has(t.task_type);

// What a half-done study / video part earns of its weight (there is no finer measure for it: the student declares done / half / not).
export const STUDY_HALF_CREDIT = 0.5;

// The two weights of a Konu Çalışması / Video task: the study part (time target, or the 30-minute default when the task names neither a
// time nor a question target) and the question part (question target). A part that was not given weighs 0.
export function studyTaskParts(t: Partial<Pick<WeightableTask, "course_id" | "total_count" | "duration_minutes">>): { study: number; questions: number } {
  const total = t.total_count;
  const hasQuestions = positive(total);
  const hasTime = positive(t.duration_minutes);
  return {
    questions: hasQuestions ? Math.round(total * UNITS_PER_QUESTION * subjectCoefficient(t.course_id)) : 0,
    study: hasTime || !hasQuestions ? Math.round(minutesUnits(t.duration_minutes, t.course_id)) : 0,
  };
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
    case "topic_study":
    case "video": {
      // Study part + question part, summed (see the header): a task with both a time and a question target is two efforts.
      const parts = studyTaskParts(t);
      return parts.study + parts.questions;
    }
    case "reading":
      return Math.round(minutesUnits(t.duration_minutes, t.course_id));
    default: {
      // question_bank, extra_custom and the routine tasks (paragraf,
      // problem, yeni nesil...): question count when there is one, else
      // a duration if the coach/student gave one, else the default.
      //
      // A Kaynak Taraması takes the very same path and its result is scaled by RESOURCE_REVIEW_WEIGHT_MULTIPLIER (applied before the
      // rounding), so it is 1.5x the equivalent Soru Çözümü in all three cases.
      const multiplier = t.task_type === RESOURCE_REVIEW_TASK_TYPE ? RESOURCE_REVIEW_WEIGHT_MULTIPLIER : 1;
      if (t.course_id === "kitap-okuma") return Math.round(minutesUnits(t.duration_minutes, t.course_id) * multiplier);
      if (positive(t.total_count)) return Math.round(t.total_count * UNITS_PER_QUESTION * coef * multiplier);
      if (positive(t.duration_minutes)) return Math.round(t.duration_minutes * unitsPerMinute(t.course_id) * multiplier);
      return Math.round(DEFAULT_TASK_UNITS * multiplier);
    }
  }
}

// Questions solved so far: Doğru + Yanlış + Boş, the same sum computeAutoTaskStatus judges "done" by.
export function solvedCount(t: Pick<WeightableTask, "correct_count" | "wrong_count" | "empty_count" | "solved_count">): number {
  if (typeof t.solved_count === "number" && Number.isFinite(t.solved_count)) return Math.max(0, t.solved_count);
  return Math.max(0, (t.correct_count ?? 0) + (t.wrong_count ?? 0) + (t.empty_count ?? 0));
}

type CreditInput = Partial<Omit<WeightableTask, "task_date" | "status">> & { status: string };

// The question target's own status, the way the student's form derives it (computeAutoTaskStatus): null with no target.
function countStatusOf(t: CreditInput): "done" | "half_done" | null {
  return positive(t.total_count) ? computeAutoTaskStatus(t.total_count, solvedCount(t), 0, 0) : null;
}

// The student's pick for the study / video part of a Konu Çalışması / Video task. `study_status` is the pick itself; it is trusted only
// while the overall status still equals what it merges to with the question counts -- if somebody (the coach) has since set the task's
// status by hand, that override is the answer; and a row with no study_status (older rows) reads its status as the pick.
export function effectiveStudyStatus(t: CreditInput): DualPartStatus | null {
  const picked = t.study_status === "done" || t.study_status === "half_done" || t.study_status === "not_done" ? t.study_status : null;
  if (picked) {
    const counts = countStatusOf(t);
    const merged = counts ? mergeDualTaskStatus(picked, counts) : picked;
    if (merged === t.status) return picked;
  }
  return t.status === "done" || t.status === "half_done" || t.status === "not_done" ? t.status : null;
}

// The share (0..1) of the question part solved: Doğru + Yanlış + Boş over Toplam, whole credit from within the 5-question tolerance up
// (35 / 40 is full, like the automatic status), nothing when nothing was entered.
function questionPartFraction(t: CreditInput): number {
  if (!positive(t.total_count)) return 0;
  const solved = solvedCount(t);
  if (solved <= 0) return 0;
  return t.total_count - solved <= AUTO_STATUS_TOLERANCE ? 1 : solved / t.total_count;
}

function studyPartFraction(status: DualPartStatus | null): number {
  return status === "done" ? 1 : status === "half_done" ? STUDY_HALF_CREDIT : 0;
}

// What a Konu Çalışması / Video task has earned: each of its two parts on its own (see the header). A task that is still pending -- or
// held for approval -- has earned nothing yet.
function studyTaskCredit(t: CreditInput): number {
  if (t.status !== "done" && t.status !== "half_done" && t.status !== "not_done") return 0;
  const parts = studyTaskParts(t);
  return parts.study * studyPartFraction(effectiveStudyStatus(t)) + parts.questions * questionPartFraction(t);
}

// The share (0..1) of a task's weight its status has earned: see PARTIAL CREDIT above (for a Konu Çalışması / Video task: the two parts
// together, as a share of the summed weight).
export function taskCreditFraction(t: CreditInput): number {
  if (isStudyTask(t)) {
    const weight = taskWeight(t);
    return weight > 0 ? studyTaskCredit(t) / weight : 0;
  }
  if (t.status === "done") return 1;
  if (t.status !== "half_done") return 0;
  if (!positive(t.total_count)) return 0;
  const solved = solvedCount(t);
  return solved > 0 ? Math.min(1, solved / t.total_count) : 0;
}

// The weight a task has earned so far (its full weight when done, a proportional part when half done, else 0; a Konu Çalışması / Video
// task earns its study and question parts separately).
export function taskCredit(t: CreditInput): number {
  if (isStudyTask(t)) return studyTaskCredit(t);
  const fraction = taskCreditFraction(t);
  return fraction === 0 ? 0 : taskWeight(t) * fraction;
}

// Earned / total effort units of any set of tasks: the single sum behind every percentage (weightedCycleCounts / weightedDayCounts below,
// the coach's per-track and per-course bars, the cohort bars of lib/program-completion-bars.ts).
export function weightedCounts(tasks: WeightableTask[]): CompletionCounts {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    total += taskWeight(t);
    done += taskCredit(t);
  }
  return { done, total };
}

// Weighted twin of completion.ts's closedCycleCounts -- every task within a
// fixed [start, end] window counts (current and previous alike; there's no
// more "cap at today" special case, see that file's header comment for why).
// done/total are effort units.
export function weightedCycleCounts(tasks: WeightableTask[], window: CycleWindow): CompletionCounts {
  return weightedCounts(tasks.filter((t) => t.task_date >= window.start && t.task_date <= window.end));
}

export function weightedDayCounts(tasks: WeightableTask[], dateIso: string): CompletionCounts {
  return weightedCounts(tasks.filter((t) => t.task_date === dateIso));
}

// How much finishing `task` moves its day's bar, as a whole percent
// (>= 1 when it counts for anything). Null when the day has no weight.
export function impactPercent(task: WeightableTask, dayTasks: WeightableTask[]): number | null {
  const total = dayTasks.reduce((acc, t) => acc + taskWeight(t), 0);
  if (total <= 0) return null;
  return Math.max(1, Math.round((taskWeight(task) / total) * 100));
}
