// "Problemler" in TYT Matematik, and the standalone "Problem" routine tied to it.
//
// The unit "Problemler" is a grouped unit like any other (lib/curriculum/topic-groups.ts: master topic "Problemler
// (Genel)", eight specific subtopics). What is special about it is the "Problem" routine (course_id "problem", the
// tasks of the Rutinler lane, which also feed the Problem tracker): for Kaynak Takibi its results are read as the master
// topic's own -- bridgeProblemRoutine moves them over when the page loads. Nothing is written twice and no row is
// changed in the database, so it also covers every task logged before this existed.
import { addStats, type Stat } from "./topic-groups";

export const PROBLEMLER_COURSE_ID = "tyt-matematik";
export const PROBLEMLER_UNIT_LABEL = "Problemler";
export const PROBLEMLER_MASTER_ID = "tyt-matematik-problemler";
// The routine pseudo-course of the standalone "Problem" tasks.
export const PROBLEM_ROUTINE_COURSE_ID = "problem";

const ZERO: Stat = { total: 0, correct: 0, wrong: 0, empty: 0 };

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
  target.topicStats.byTopic[PROBLEMLER_MASTER_ID] = addStats(target.topicStats.byTopic[PROBLEMLER_MASTER_ID] ?? ZERO, stat);
  routine.topicStats.karma = { ...ZERO };
}
