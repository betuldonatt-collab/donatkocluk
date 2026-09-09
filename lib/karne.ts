// "Aylık Karne" (monthly report card) topic-mistake aggregation -- a
// date-range-bounded sibling of lib/gelisim-haritasi.ts's computeGelisimHaritasi.
// That one windows each course to its most recent N trials regardless of
// when they happened; a Karne instead needs everything that happened
// within one specific calendar month, so the count-based `.slice(0, N)`
// step is replaced with a task_date range filter. Same courseId::topicId
// counting convention and the same TYT_SUBJECT_GROUPS general-exam
// membership rule as gelisim-haritasi.ts, kept identical on purpose so a
// topic's color means the same thing in both features.
import { findCourseById, TRACK_LABELS, type Track } from "./curriculum";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  inferAytTrackFromScores,
  TYT_SUBJECT_GROUPS,
  type AytSubjectGroupKey,
  type SubjectGroupKey,
} from "./curriculum/subject-groups";
import { computeNet } from "./scoring";

export type KarneTopicRow = {
  courseId: string;
  courseName: string;
  topicId: string;
  topicName: string;
  count: number;
  windowSize: number;
};

export type KarneExam = { id: string; task_date: string; task_type: string; course_id: string | null };
export type KarneMistakeRow = { task_id: string; course_id: string; topic_id: string };

const GENERAL_EXAM_COURSE_IDS = new Set(TYT_SUBJECT_GROUPS.flatMap((g) => g.courseIds));

export function computeAylikKarne(
  courseIds: string[],
  exams: KarneExam[],
  mistakeRows: KarneMistakeRow[],
  rangeStart: string,
  rangeEnd: string,
): KarneTopicRow[] {
  const mistakesByTask = new Map<string, Set<string>>();
  for (const m of mistakeRows) {
    const set = mistakesByTask.get(m.task_id) ?? new Set<string>();
    set.add(`${m.course_id}::${m.topic_id}`);
    mistakesByTask.set(m.task_id, set);
  }

  const rows: KarneTopicRow[] = [];
  for (const courseId of courseIds) {
    const course = findCourseById(courseId);
    if (!course) continue;

    const relevant = exams.filter(
      (e) =>
        e.task_date >= rangeStart &&
        e.task_date <= rangeEnd &&
        ((e.task_type === "branch_exam" && e.course_id === courseId) ||
          (e.task_type === "general_exam" && GENERAL_EXAM_COURSE_IDS.has(courseId))),
    );
    const windowSize = relevant.length;

    for (const unit of course.units) {
      for (const topic of unit.topics) {
        const key = `${courseId}::${topic.id}`;
        const count = relevant.filter((e) => mistakesByTask.get(e.id)?.has(key)).length;
        rows.push({ courseId, courseName: course.name, topicId: topic.id, topicName: topic.name, count, windowSize });
      }
    }
  }
  return rows;
}

// --- Karne v2: cycle math + net summary (shared by the coach's generate
// action and the student's archived-snapshot rendering) --------------------

// A cycle is a fixed 4-week (28-day, inclusive) block, chained strictly
// sequentially from the student's coaching start -- never anchored to
// "today," so a coach generating cycles late/in bursts still produces a
// gapless, ordered history instead of skipping ahead.
export const CYCLE_DAYS = 28;

function addDaysISO(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextCycleRange(
  coachingStartDate: string,
  previousCycleEnd: string | null,
): { rangeStart: string; rangeEnd: string } {
  const rangeStart = previousCycleEnd ? addDaysISO(previousCycleEnd, 1) : coachingStartDate;
  const rangeEnd = addDaysISO(rangeStart, CYCLE_DAYS - 1);
  return { rangeStart, rangeEnd };
}

// Both endpoints counted (so a same-day range is 1, not 0) -- matches
// nextCycleRange's own "28-day inclusive block" convention above, so a
// normally-generated cycle's own range always measures exactly
// CYCLE_DAYS here. Shared by approveReportCard's server-side guard and
// the coach panel's own mirrored client-side check (KarnelerTab) so the
// two can never disagree about what counts as "at least 28 days."
export function inclusiveDaySpan(rangeStart: string, rangeEnd: string): number {
  const start = new Date(`${rangeStart}T00:00:00Z`).getTime();
  const end = new Date(`${rangeEnd}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export type NetSummary = {
  tyt: { current: number | null; previous: number | null };
  ayt: { current: number | null; previous: number | null };
  scoreBreakdown?: KarneScoreBreakdown;
  // One entry per track the student actually has signal in this cycle
  // (see computeAytScoreBreakdown's own comment) -- absent/empty is
  // normal, not an error, for a cycle with no AYT activity at all.
  aytScoreBreakdown?: KarneTrackScoreBreakdown[];
  // Every minute logged in the system this cycle, across every task type
  // (question_bank/topic_study/branch_exam/general_exam/video/extra_custom)
  // -- deliberately not scoped to the same 4 exam-shaped types
  // scoreBreakdown/aytScoreBreakdown are, since "how long did the student
  // actually study" is a different question than "how did they score."
  totalDurationMinutes?: number;
};

// Sums duration_minutes across whatever rows the caller already fetched
// (generateCycleReportCard scopes the query itself to the cycle's date
// range and the same soft-coach-approval filter every other Karne metric
// respects -- see that function's own comment) -- a null duration
// (untimed practice) contributes 0, not NaN.
export function computeTotalDurationMinutes(tasks: { duration_minutes: number | null }[]): number {
  return tasks.reduce((sum, t) => sum + (t.duration_minutes ?? 0), 0);
}

type SubjectScores = Record<string, { correct?: number; wrong?: number; empty?: number }>;
export type KarneGeneralExam = { task_date: string; title: string; subject_scores: SubjectScores | null };

// General-exam tasks have no course_id -- the TYT/AYT track lives only in
// the title text, same convention every panel already parses it with.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" {
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

// Average net across every general_exam in [rangeStart, rangeEnd] for one
// track. Correct/wrong are averaged first, then netted once on the
// averages (not averaged-per-exam-then-averaged-again), matching this
// codebase's established "sum totals, net once" convention (see
// netChartFor in the analysis clients) so rounding never compounds.
function averageNetForTrack(exams: KarneGeneralExam[], track: "tyt" | "ayt"): number | null {
  const inTrack = exams.filter((e) => parseGeneralExamTrack(e.title) === track && e.subject_scores);
  if (inTrack.length === 0) return null;

  const totals = inTrack.reduce(
    (acc, e) => {
      const t = Object.values(e.subject_scores!).reduce<{ correct: number; wrong: number }>(
        (s, v) => ({ correct: s.correct + (v.correct ?? 0), wrong: s.wrong + (v.wrong ?? 0) }),
        { correct: 0, wrong: 0 },
      );
      return { correct: acc.correct + t.correct, wrong: acc.wrong + t.wrong };
    },
    { correct: 0, wrong: 0 },
  );
  return computeNet(totals.correct / inTrack.length, totals.wrong / inTrack.length);
}

// "Current" half of a NetSummary for one cycle -- "previous" is filled in
// by the caller from the prior cycle's own saved snapshot (stats.*.current),
// not a second live query, since every cycle's numbers are archived once
// generated.
export function computeNetSummary(
  exams: KarneGeneralExam[],
  rangeStart: string,
  rangeEnd: string,
): { tyt: number | null; ayt: number | null } {
  const inRange = exams.filter((e) => e.task_date >= rangeStart && e.task_date <= rangeEnd);
  return { tyt: averageNetForTrack(inRange, "tyt"), ayt: averageNetForTrack(inRange, "ayt") };
}

// --- Karne v2: "Toplam Doğru/Yanlış/Boş" (TYT-only score breakdown) ------
//
// Replaces the old TYT-only "Soru Çözüm Hızı" (questions/hour) metric --
// same TYT-only scope and reasoning (see NetSummary's own comment above),
// but a straight correct/wrong/empty rollup is a clearer "how did this
// cycle actually go" signal than a speed ratio.
//
// Combines the two data shapes that carry real D/Y/B counts for TYT:
// - course_id-tagged practice rows (question_bank/topic_study/branch_exam
//   under a "tyt-" course), counts on the row itself.
// - TYT general_exam rows, counts inside subject_scores, keyed exactly by
//   SubjectGroupKey already.
// Both are bucketed into the same 4 TYT_SUBJECT_GROUPS keys, since a
// practice course (e.g. "tyt-geometri") and a general exam's matching
// subject key ("matematik") describe the same real-world subject -- the
// breakdown answers "how did the student do in Matematik", not "which
// screen was this logged from".
export type KarneScoreTask = {
  task_date: string;
  course_id: string | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
};

export type KarneSubjectScoreRow = { key: string; label: string; correct: number; wrong: number; empty: number };
export type KarneScoreBreakdown = {
  total: { correct: number; wrong: number; empty: number };
  bySubject: KarneSubjectScoreRow[];
};

const TYT_COURSE_TO_SUBJECT_GROUP = new Map<string, SubjectGroupKey>(
  TYT_SUBJECT_GROUPS.flatMap((g) => g.courseIds.map((courseId) => [courseId, g.key] as const)),
);

export function computeTytScoreBreakdown(
  tasks: KarneScoreTask[],
  exams: KarneGeneralExam[],
  rangeStart: string,
  rangeEnd: string,
): KarneScoreBreakdown {
  const bySubject = new Map<SubjectGroupKey, { correct: number; wrong: number; empty: number }>(
    TYT_SUBJECT_GROUPS.map((g) => [g.key, { correct: 0, wrong: 0, empty: 0 }]),
  );

  for (const t of tasks) {
    if (t.task_date < rangeStart || t.task_date > rangeEnd || !t.course_id) continue;
    const key = TYT_COURSE_TO_SUBJECT_GROUP.get(t.course_id);
    if (!key) continue;
    const bucket = bySubject.get(key)!;
    bucket.correct += t.correct_count ?? 0;
    bucket.wrong += t.wrong_count ?? 0;
    bucket.empty += t.empty_count ?? 0;
  }

  for (const e of exams) {
    if (e.task_date < rangeStart || e.task_date > rangeEnd || !e.subject_scores) continue;
    if (parseGeneralExamTrack(e.title) !== "tyt") continue;
    for (const group of TYT_SUBJECT_GROUPS) {
      const s = e.subject_scores[group.key];
      if (!s) continue;
      const bucket = bySubject.get(group.key)!;
      bucket.correct += s.correct ?? 0;
      bucket.wrong += s.wrong ?? 0;
      bucket.empty += s.empty ?? 0;
    }
  }

  const bySubjectRows: KarneSubjectScoreRow[] = TYT_SUBJECT_GROUPS.map((g) => ({ key: g.key, label: g.label, ...bySubject.get(g.key)! }));
  const total = bySubjectRows.reduce(
    (acc, r) => ({ correct: acc.correct + r.correct, wrong: acc.wrong + r.wrong, empty: acc.empty + r.empty }),
    { correct: 0, wrong: 0, empty: 0 },
  );

  return { total, bySubject: bySubjectRows };
}

// --- Karne v2: AYT course-level D/Y/B breakdown, one per track -----------
//
// AYT's own counterpart to computeTytScoreBreakdown above -- same two
// data shapes (course_id-tagged practice rows + general_exam subject_scores),
// same "bucket by real-world subject" idea, but AYT's subject groups are
// track-specific (sayısal/EA/sözel each sit different courses under
// different keys -- see AYT_SUBJECT_GROUPS_BY_TRACK) and two different
// tracks can share the exact same group LABEL ("Matematik" exists under
// both sayısal and EA, with different course composition and different
// numbers) -- so unlike the single flat TYT breakdown, this returns one
// breakdown per track, and only for a track the student actually has any
// signal in. A student practically only ever has one real track, so this
// is almost always a 1-element (or empty) array in practice, not 3.
export type KarneTrackScoreBreakdown = {
  track: Track;
  trackLabel: string;
  total: { correct: number; wrong: number; empty: number };
  bySubject: KarneSubjectScoreRow[];
};

const AYT_TRACKS: Track[] = ["sayisal", "ea", "sozel"];

const AYT_COURSE_TO_SUBJECT_GROUP = new Map<string, { track: Track; key: AytSubjectGroupKey }>(
  AYT_TRACKS.flatMap((track) =>
    AYT_SUBJECT_GROUPS_BY_TRACK[track].flatMap((g) => g.courseIds.map((courseId) => [courseId, { track, key: g.key }] as const)),
  ),
);

export function computeAytScoreBreakdown(
  tasks: KarneScoreTask[],
  exams: KarneGeneralExam[],
  rangeStart: string,
  rangeEnd: string,
): KarneTrackScoreBreakdown[] {
  const byTrack = new Map<Track, Map<AytSubjectGroupKey, { correct: number; wrong: number; empty: number }>>();
  function bucketFor(track: Track, key: AytSubjectGroupKey) {
    const trackMap = byTrack.get(track) ?? new Map<AytSubjectGroupKey, { correct: number; wrong: number; empty: number }>();
    byTrack.set(track, trackMap);
    const bucket = trackMap.get(key) ?? { correct: 0, wrong: 0, empty: 0 };
    trackMap.set(key, bucket);
    return bucket;
  }

  for (const t of tasks) {
    if (t.task_date < rangeStart || t.task_date > rangeEnd || !t.course_id) continue;
    const mapped = AYT_COURSE_TO_SUBJECT_GROUP.get(t.course_id);
    if (!mapped) continue;
    const bucket = bucketFor(mapped.track, mapped.key);
    bucket.correct += t.correct_count ?? 0;
    bucket.wrong += t.wrong_count ?? 0;
    bucket.empty += t.empty_count ?? 0;
  }

  for (const e of exams) {
    if (e.task_date < rangeStart || e.task_date > rangeEnd || !e.subject_scores) continue;
    if (parseGeneralExamTrack(e.title) !== "ayt") continue;
    const track = inferAytTrackFromScores(e.subject_scores);
    if (!track) continue;
    for (const group of AYT_SUBJECT_GROUPS_BY_TRACK[track]) {
      const s = e.subject_scores[group.key];
      if (!s) continue;
      const bucket = bucketFor(track, group.key);
      bucket.correct += s.correct ?? 0;
      bucket.wrong += s.wrong ?? 0;
      bucket.empty += s.empty ?? 0;
    }
  }

  const result: KarneTrackScoreBreakdown[] = [];
  for (const track of AYT_TRACKS) {
    const trackMap = byTrack.get(track);
    if (!trackMap) continue;
    const bySubjectRows: KarneSubjectScoreRow[] = AYT_SUBJECT_GROUPS_BY_TRACK[track].map((g) => ({
      key: g.key,
      label: g.label,
      ...(trackMap.get(g.key) ?? { correct: 0, wrong: 0, empty: 0 }),
    }));
    const total = bySubjectRows.reduce(
      (acc, r) => ({ correct: acc.correct + r.correct, wrong: acc.wrong + r.wrong, empty: acc.empty + r.empty }),
      { correct: 0, wrong: 0, empty: 0 },
    );
    result.push({ track, trackLabel: TRACK_LABELS[track], total, bySubject: bySubjectRows });
  }
  return result;
}
