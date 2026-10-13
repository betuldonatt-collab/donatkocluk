// The calculation layer of the unified Karne (the 1-2 page executive report card).
//
// One pure function turns "this student's tasks around a period" (+ the period's event attendance) into a KarneSummary: every number
// the document shows, each next to the same number for the PREVIOUS period of equal length, plus a weekly momentum trend and a
// high-level exam overview. Nothing here reads the database (lib/karne-summary-data.ts does) and nothing here is a topic-level
// breakdown -- the topic heat map and the detailed analytics are separate tools.
//
// Conventions kept from the existing report cards (lib/karne.ts): only coach-approved / coach-assigned tasks reach it (the caller
// filters), "sum the D/Y first, net once" for averaged nets, 4:1 net for YKS and 3:1 for LGS / the 7th grade, and the study time is
// TRACKED time (Süre Tut / kronometre), never a target duration.
//
// The summary is JSON-safe on purpose: the parent's report card stores it as a snapshot at approval (migration 0136).

import { completionPercent } from "./completion";
import { mondayOf } from "./date";
import { TRACK_LABELS, type Track } from "./curriculum";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  inferAytTrackFromScores,
  LGS_EXAM_SUBJECTS,
  MAARIF7_EXAM_SUBJECTS,
  TYT_SUBJECT_GROUPS,
} from "./curriculum/subject-groups";
import { weightedCycleCounts, type WeightableTask } from "./effort-weight";
import type { ParentEventAttendance } from "./event-attendance";
import { parseGeneralExamTrack } from "./karne";
import { computeLgsNet, computeNet } from "./scoring";

export const KARNE_SUMMARY_VERSION = 1;
export const DEFAULT_TREND_WEEKS = 12;

type SubjectScores = Record<string, { correct?: number; wrong?: number; empty?: number }>;

export type KarneSummaryTask = WeightableTask & {
  correct_count?: number | null;
  wrong_count?: number | null;
  empty_count?: number | null;
  // Seconds are stored on the task; minutes are what the app reads (student_tasks.tracked_duration_minutes).
  tracked_duration_minutes?: number | null;
  subject_scores?: SubjectScores | null;
};

export type ExamGroupKey = "tyt" | `ayt:${Track}` | "lgs" | "m7";

export type KarneExamItem = {
  date: string;
  title: string;
  net: number;
  // Against the previous exam of the same kind (this period's earlier one, else the previous period's last); null for the first.
  deltaVsPrevious: number | null;
};

// `questions` is the branch's real question count in that exam, so a bar can show the net against what was possible.
export type KarneBranchAverage = { key: string; label: string; averageNet: number; questions: number };

export type KarneExamGroup = {
  key: ExamGroupKey;
  label: string;
  items: KarneExamItem[];
  averageNet: number;
  bestNet: number;
  previousAverageNet: number | null;
  branches: KarneBranchAverage[];
};

export type KarneTrendWeek = {
  weekStart: string;
  weekEnd: string;
  // Weighted completion of that week's tasks; null for a week with no tasks or one that has not started yet.
  pct: number | null;
  // The week overlaps the report's period: drawn thick and dark, the earlier ones thin and grey.
  inPeriod: boolean;
};

export type KarneSummary = {
  version: typeof KARNE_SUMMARY_VERSION;
  generatedAt: string;
  period: { start: string; end: string; days: number };
  previousPeriod: { start: string; end: string };
  completion: { pct: number | null; previousPct: number | null };
  questions: {
    total: number;
    correct: number;
    wrong: number;
    empty: number;
    previousTotal: number;
  };
  // Time tracked with the kronometre on tasks in the site -- shown as its own prominent block.
  studyTime: { minutes: number; previousMinutes: number };
  consistency: { activeDays: number; totalDays: number; previousActiveDays: number; previousTotalDays: number };
  attendance: {
    attendedSessions: number;
    // Sessions the coach actually took attendance for -- an unmarked session is not an absence.
    recordedSessions: number;
    ratePct: number | null;
    events: ParentEventAttendance[];
  };
  trend: { weeks: KarneTrendWeek[] };
  exams: { groups: KarneExamGroup[] };
};

export type KarneSummaryInput = {
  rangeStart: string;
  rangeEnd: string;
  // YYYY-MM-DD "today" (UTC calendar day, like the rest of the app); injected so the function stays pure.
  today: string;
  // ISO timestamp stamped on the summary.
  now: string;
  // Every task of the student (coach-assigned or coach-approved only) from at least the start of the previous period / the trend's
  // first week, up to rangeEnd. Rows outside what a figure needs are simply ignored.
  tasks: KarneSummaryTask[];
  // The period's event attendance, already built per student (lib/event-attendance.ts buildParentEventAttendance).
  events: ParentEventAttendance[];
  // The student's own AYT field, for naming; the exams themselves carry their field in their subject keys.
  aytTrack?: Track | null;
  // 11th graders take a TYT-structured exam under their own name.
  maarifGrade?: 7 | 11 | null;
  trendWeeks?: number;
};

// ---- dates -------------------------------------------------------------------------------------------------------------------

export function addDaysISO(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function inclusiveDays(start: string, end: string): number {
  if (end < start) return 0;
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

// The period of the same length right before [start, end].
export function previousWindow(start: string, end: string): { start: string; end: string } {
  const len = Math.max(1, inclusiveDays(start, end));
  return { start: addDaysISO(start, -len), end: addDaysISO(start, -1) };
}

// Earliest date any figure needs: the start of the previous period or of the trend's first week, whichever is earlier.
export function summaryDataStart(rangeStart: string, rangeEnd: string, today: string, trendWeeks: number = DEFAULT_TREND_WEEKS): string {
  const prev = previousWindow(rangeStart, rangeEnd).start;
  const anchor = rangeEnd < today ? rangeEnd : today;
  const trendStart = addDaysISO(mondayOf(anchor), -7 * (Math.max(1, trendWeeks) - 1));
  return prev < trendStart ? prev : trendStart;
}

const inWindow = <T extends { task_date: string }>(rows: T[], start: string, end: string) =>
  rows.filter((r) => r.task_date >= start && r.task_date <= end);

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- questions / time / consistency ------------------------------------------------------------------------------------------

// A finished (or half-finished) task's D/Y/B. Same rule as the topic stats (done / half_done); a Genel Deneme carries its
// numbers in subject_scores, everything else in the task's own columns, so nothing is counted twice.
function questionCounts(tasks: KarneSummaryTask[]): { correct: number; wrong: number; empty: number } {
  let correct = 0;
  let wrong = 0;
  let empty = 0;
  for (const t of tasks) {
    if (t.status !== "done" && t.status !== "half_done") continue;
    if (t.task_type === "general_exam" && t.subject_scores) {
      for (const s of Object.values(t.subject_scores)) {
        correct += s.correct ?? 0;
        wrong += s.wrong ?? 0;
        empty += s.empty ?? 0;
      }
      continue;
    }
    correct += t.correct_count ?? 0;
    wrong += t.wrong_count ?? 0;
    empty += t.empty_count ?? 0;
  }
  return { correct, wrong, empty };
}

function trackedMinutes(tasks: KarneSummaryTask[]): number {
  return tasks.reduce((sum, t) => sum + (typeof t.tracked_duration_minutes === "number" && t.tracked_duration_minutes > 0 ? t.tracked_duration_minutes : 0), 0);
}

// A day counts as "çalıştı" when the student tracked time on a task of that day or finished at least one task of that day. Days
// after today are not counted at all (an unfinished period is not penalised for its future).
function activeDays(tasks: KarneSummaryTask[], start: string, end: string, today: string): { active: number; total: number } {
  const last = end < today ? end : today;
  const total = inclusiveDays(start, last);
  if (total === 0) return { active: 0, total: 0 };
  const days = new Set<string>();
  for (const t of inWindow(tasks, start, last)) {
    const tracked = typeof t.tracked_duration_minutes === "number" && t.tracked_duration_minutes > 0;
    if (tracked || t.status === "done") days.add(t.task_date);
  }
  return { active: days.size, total };
}

// ---- trend ---------------------------------------------------------------------------------------------------------------------

function weeklyTrend(tasks: KarneSummaryTask[], start: string, end: string, today: string, weeks: number): KarneTrendWeek[] {
  const anchor = end < today ? end : today;
  const lastWeekStart = mondayOf(anchor);
  const result: KarneTrendWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDaysISO(lastWeekStart, -7 * i);
    const weekEnd = addDaysISO(weekStart, 6);
    const started = weekStart <= today;
    result.push({
      weekStart,
      weekEnd,
      pct: started ? completionPercent(weightedCycleCounts(tasks, { start: weekStart, end: weekEnd })) : null,
      inPeriod: weekStart <= end && weekEnd >= start,
    });
  }
  return result;
}

// ---- exams ---------------------------------------------------------------------------------------------------------------------

type ExamRow = { date: string; title: string; groupKey: ExamGroupKey; scores: SubjectScores };

function examRows(tasks: KarneSummaryTask[]): ExamRow[] {
  const rows: ExamRow[] = [];
  for (const t of tasks) {
    if (t.task_type !== "general_exam" || !t.subject_scores || Object.keys(t.subject_scores).length === 0) continue;
    const title = t.title ?? "";
    const track = parseGeneralExamTrack(title);
    let groupKey: ExamGroupKey;
    if (track === "tyt") groupKey = "tyt";
    else if (track === "ayt") {
      const aytTrack = inferAytTrackFromScores(t.subject_scores);
      if (!aytTrack) continue;
      groupKey = `ayt:${aytTrack}`;
    } else if (track === "lgs") groupKey = "lgs";
    else if (track === "m7") groupKey = "m7";
    else continue; // 9th / 10th grade exams are not part of the report card
    rows.push({ date: t.task_date, title, groupKey, scores: t.subject_scores });
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title, "tr")));
}

const netFnFor = (key: ExamGroupKey) => (key === "lgs" || key === "m7" ? computeLgsNet : computeNet);

function totalsOf(scores: SubjectScores): { correct: number; wrong: number } {
  return Object.values(scores).reduce<{ correct: number; wrong: number }>(
    (acc, s) => ({ correct: acc.correct + (s.correct ?? 0), wrong: acc.wrong + (s.wrong ?? 0) }),
    { correct: 0, wrong: 0 },
  );
}

function examNet(row: ExamRow): number {
  const { correct, wrong } = totalsOf(row.scores);
  return netFnFor(row.groupKey)(correct, wrong);
}

// "Average the D and Y over the exams, then net once" -- the codebase's convention, so rounding never compounds.
function averageNet(rows: ExamRow[]): number | null {
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => {
    const t = totalsOf(r.scores);
    return { correct: acc.correct + t.correct, wrong: acc.wrong + t.wrong };
  }, { correct: 0, wrong: 0 });
  return netFnFor(rows[0].groupKey)(sum.correct / rows.length, sum.wrong / rows.length);
}

function branchDefinitions(key: ExamGroupKey): { key: string; label: string; questions: number }[] {
  if (key === "tyt") return TYT_SUBJECT_GROUPS.map((g) => ({ key: g.key, label: g.label, questions: g.questions }));
  if (key === "lgs") return LGS_EXAM_SUBJECTS.map((s) => ({ key: s.key, label: s.label, questions: s.questions }));
  if (key === "m7") return MAARIF7_EXAM_SUBJECTS.map((s) => ({ key: s.key, label: s.label, questions: s.questions }));
  const track = key.slice(4) as Track;
  return AYT_SUBJECT_GROUPS_BY_TRACK[track].map((g) => ({ key: g.key, label: g.label, questions: g.questions }));
}

function branchAverages(rows: ExamRow[], key: ExamGroupKey): KarneBranchAverage[] {
  const netFn = netFnFor(key);
  const result: KarneBranchAverage[] = [];
  for (const def of branchDefinitions(key)) {
    const having = rows.filter((r) => r.scores[def.key]);
    if (having.length === 0) continue;
    const c = having.reduce((s, r) => s + (r.scores[def.key].correct ?? 0), 0) / having.length;
    const w = having.reduce((s, r) => s + (r.scores[def.key].wrong ?? 0), 0) / having.length;
    result.push({ key: def.key, label: def.label, averageNet: netFn(c, w), questions: def.questions });
  }
  return result;
}

function groupLabel(key: ExamGroupKey, maarifGrade: 7 | 11 | null | undefined): string {
  if (key === "tyt") return maarifGrade === 11 ? "11. Sınıf Genel Deneme" : "TYT Genel Deneme";
  if (key === "lgs") return "LGS Genel Deneme";
  if (key === "m7") return "7. Sınıf Genel Deneme";
  return `AYT Genel Deneme (${TRACK_LABELS[key.slice(4) as Track]})`;
}

const GROUP_ORDER: ExamGroupKey[] = ["tyt", "ayt:sayisal", "ayt:ea", "ayt:sozel", "lgs", "m7"];

function buildExamGroups(
  history: ExamRow[],
  start: string,
  end: string,
  previous: { start: string; end: string },
  maarifGrade: 7 | 11 | null | undefined,
): KarneExamGroup[] {
  const groups: KarneExamGroup[] = [];
  for (const key of GROUP_ORDER) {
    const all = history.filter((r) => r.groupKey === key);
    const current = all.filter((r) => r.date >= start && r.date <= end);
    if (current.length === 0) continue;
    const previousRows = all.filter((r) => r.date >= previous.start && r.date <= previous.end);

    const items: KarneExamItem[] = current.map((row) => {
      const before = all.filter((r) => r.date < row.date || (r.date === row.date && r.title < row.title));
      const last = before[before.length - 1];
      return { date: row.date, title: row.title, net: examNet(row), deltaVsPrevious: last ? round2(examNet(row) - examNet(last)) : null };
    });
    const nets = items.map((i) => i.net);
    groups.push({
      key,
      label: groupLabel(key, maarifGrade),
      items,
      averageNet: averageNet(current)!,
      bestNet: Math.max(...nets),
      previousAverageNet: averageNet(previousRows),
      branches: branchAverages(current, key),
    });
  }
  return groups;
}

// ---- the summary ---------------------------------------------------------------------------------------------------------------

export function computeKarneSummary(input: KarneSummaryInput): KarneSummary {
  const { rangeStart, rangeEnd, today, tasks, events } = input;
  const previous = previousWindow(rangeStart, rangeEnd);
  const weeks = Math.max(1, input.trendWeeks ?? DEFAULT_TREND_WEEKS);

  const current = inWindow(tasks, rangeStart, rangeEnd);
  const before = inWindow(tasks, previous.start, previous.end);

  const counts = weightedCycleCounts(tasks, { start: rangeStart, end: rangeEnd });
  const previousCounts = weightedCycleCounts(tasks, { start: previous.start, end: previous.end });

  const q = questionCounts(current);
  const pq = questionCounts(before);

  const days = activeDays(tasks, rangeStart, rangeEnd, today);
  const prevDays = activeDays(tasks, previous.start, previous.end, today);

  let attended = 0;
  let recorded = 0;
  for (const e of events) {
    attended += e.summary.attended;
    recorded += e.summary.attended + e.summary.absent;
  }

  return {
    version: KARNE_SUMMARY_VERSION,
    generatedAt: input.now,
    period: { start: rangeStart, end: rangeEnd, days: inclusiveDays(rangeStart, rangeEnd) },
    previousPeriod: previous,
    completion: { pct: completionPercent(counts), previousPct: completionPercent(previousCounts) },
    questions: {
      total: q.correct + q.wrong + q.empty,
      correct: q.correct,
      wrong: q.wrong,
      empty: q.empty,
      previousTotal: pq.correct + pq.wrong + pq.empty,
    },
    studyTime: { minutes: trackedMinutes(current), previousMinutes: trackedMinutes(before) },
    consistency: { activeDays: days.active, totalDays: days.total, previousActiveDays: prevDays.active, previousTotalDays: prevDays.total },
    attendance: {
      attendedSessions: attended,
      recordedSessions: recorded,
      ratePct: recorded > 0 ? Math.round((attended / recorded) * 100) : null,
      events,
    },
    trend: { weeks: weeklyTrend(tasks, rangeStart, rangeEnd, today, weeks) },
    exams: { groups: buildExamGroups(examRows(tasks), rangeStart, rangeEnd, previous, input.maarifGrade) },
  };
}

// ---- small presentation helpers the document and its tests share ------------------------------------------------------------------

// "41 sa 20 dk" / "35 dk" / "2 sa".
export function formatStudyTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} dk`;
  if (minutes === 0) return `${hours} sa`;
  return `${hours} sa ${minutes} dk`;
}

// The explicit sentence next to the study-time figure: this is TRACKED time, not an assigned target.
export function studyTimeSentence(totalMinutes: number): string {
  return `Toplam ${formatStudyTime(totalMinutes)} kronometre ile çalıştı`;
}

// ▲ +9 / ▼ −4 / = 0, or null when there is nothing to compare against.
export function deltaOf(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round2(current - previous);
}
