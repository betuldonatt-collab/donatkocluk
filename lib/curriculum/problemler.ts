// "Problemler" in TYT Matematik: the problem-solving section (Sayı-Kesir, Yaş, İşçi, Hız, ... Problemleri) and the
// general "Problem" routine, tied together.
//
//   * The unit has a MASTER topic, "Problemler (Genel)" (PROBLEMLER_MASTER_ID): a task about problems in general is
//     assigned and tracked against it, without picking one of the specific subtopics. The subtopics stay as they are.
//   * Kaynak Takibi shows a parent row "Problemler" above the unit's rows with the CUMULATIVE Toplam / D / Y / B of
//     the whole section (the master topic + every subtopic).
//   * The standalone "Problem" routine (course_id "problem", tasks of the Rutinler lane, which also feed the Problem
//     tracker) keeps being its own course for everything else; for Kaynak Takibi its results are read as the master
//     topic's own: bridgeProblemRoutine moves them over when the page loads. Nothing is written twice and no row is
//     changed in the database, so it also covers every task logged before this existed.
import type { Course, Topic } from "./index";
import type { SelectionRow } from "./rows";

export const PROBLEMLER_COURSE_ID = "tyt-matematik";
export const PROBLEMLER_UNIT_LABEL = "Problemler";
export const PROBLEMLER_MASTER_ID = "tyt-matematik-problemler";
// The routine pseudo-course of the standalone "Problem" tasks.
export const PROBLEM_ROUTINE_COURSE_ID = "problem";

export type Stat = { total: number; correct: number; wrong: number; empty: number };
const ZERO: Stat = { total: 0, correct: 0, wrong: 0, empty: 0 };

function add(a: Stat, b: Stat): Stat {
  return { total: a.total + b.total, correct: a.correct + b.correct, wrong: a.wrong + b.wrong, empty: a.empty + b.empty };
}

// --- Curriculum -------------------------------------------------------------------------------------------------

// Every topic id of the section: the master topic and its specific subtopics.
export function problemlerTopicIds(course: Course): string[] {
  if (course.id !== PROBLEMLER_COURSE_ID) return [];
  return course.units.filter((u) => u.unit === PROBLEMLER_UNIT_LABEL).flatMap((u) => u.topics.map((t) => t.id));
}

export function problemlerSubtopics(course: Course): Topic[] {
  if (course.id !== PROBLEMLER_COURSE_ID) return [];
  return course.units.filter((u) => u.unit === PROBLEMLER_UNIT_LABEL).flatMap((u) => u.topics.filter((t) => t.id !== PROBLEMLER_MASTER_ID));
}

// --- Task assignment: a hierarchical choice ---------------------------------------------------------------------

// What the Konu picker shows for a stored topic id: a specific problem subtopic reads as its parent "Problemler"
// (and the secondary picker shows the subtopic); every other topic is itself.
export function problemlerMainValue(course: Course | null | undefined, topicId: string): string {
  if (!course || !topicId) return topicId;
  return problemlerSubtopics(course).some((t) => t.id === topicId) ? PROBLEMLER_MASTER_ID : topicId;
}

// The main Konu list: every topic, except that the problem subtopics are not listed on their own -- they are reached
// through "Problemler (Genel)" and its secondary picker.
export function mainTopicOptions<T extends { id: string }>(course: Course | null | undefined, options: T[]): T[] {
  if (!course || course.id !== PROBLEMLER_COURSE_ID) return options;
  const hidden = new Set(problemlerSubtopics(course).map((t) => t.id));
  return options.filter((o) => !hidden.has(o.id));
}

// --- Kaynak Takibi ----------------------------------------------------------------------------------------------

// Sum of the stats of the given topic ids.
export function sumTopicStats(byTopic: Record<string, Stat>, topicIds: string[]): Stat {
  return topicIds.reduce((acc, id) => (byTopic[id] ? add(acc, byTopic[id]) : acc), { ...ZERO });
}

type StatsEntry = { topicStats: { byTopic: Record<string, Stat>; karma: Stat } };

// Reads the standalone "Problem" routine's results as the master topic's own, for the pages that show Kaynak Takibi:
// the routine's stat bucket (course "problem", no topic) is added to TYT Matematik's "Problemler (Genel)" and emptied,
// so every figure stays counted once (the "Toplam Soru" card sums all courses). Only for a student whose Kaynak
// Takibi shows the TYT courses (a plain YKS student) -- pass enabled = false for LGS / Maarif students.
export function bridgeProblemRoutine<T extends StatsEntry>(
  courseData: Record<string, T>,
  getEntry: (courseId: string) => T,
  enabled = true,
): void {
  if (!enabled) return;
  const routine = courseData[PROBLEM_ROUTINE_COURSE_ID];
  if (!routine) return;
  const stat = routine.topicStats.karma;
  if (stat.total === 0 && stat.correct === 0 && stat.wrong === 0 && stat.empty === 0) return;
  const target = getEntry(PROBLEMLER_COURSE_ID);
  target.topicStats.byTopic[PROBLEMLER_MASTER_ID] = add(target.topicStats.byTopic[PROBLEMLER_MASTER_ID] ?? ZERO, stat);
  routine.topicStats.karma = { ...ZERO };
}

// The unit's rows with the parent "Problemler" row spliced in above its first row: a table renders this instead of
// the bare rows. The parent row carries the unit cell (so the unit's rowSpan grows by one) and the cumulative stat.
export type ProblemlerParent = {
  kind: "parent";
  unitLabel: string;
  unitRowSpan: number;
  memberTopicIds: string[];
};

// Which row the parent row goes in front of (the unit's first row, by id), and the unit-cell span each row now has.
export function problemlerParentLayout(course: Course, rows: SelectionRow[]): { parentBefore: Map<string, ProblemlerParent>; unitSpan: (row: SelectionRow) => number | null } {
  const parentBefore = new Map<string, ProblemlerParent>();
  const first = rows.find((r) => course.id === PROBLEMLER_COURSE_ID && r.unitLabel === PROBLEMLER_UNIT_LABEL && r.unitRowSpan !== null);
  if (first && first.unitRowSpan !== null) {
    parentBefore.set(first.id, {
      kind: "parent",
      unitLabel: first.unitLabel,
      unitRowSpan: first.unitRowSpan + 1,
      memberTopicIds: problemlerTopicIds(course),
    });
  }
  return {
    parentBefore,
    // The first row's unit cell moves up to the parent row.
    unitSpan: (row) => (parentBefore.has(row.id) ? null : row.unitRowSpan),
  };
}
