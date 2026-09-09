// "Gelişim Haritası" (growth map) heatmap computation -- a windowed
// sibling of the coach's all-time "Konu Performans Haritası"
// (app/coach/students/[id]/_components/topic-performance-map.tsx). Pure,
// stateless computation over already-fetched plain data (no Supabase
// client, no auth) -- shared across panels rather than duplicated, unlike
// the UI components that render it, since a drifted copy here would mean
// the coach and student literally see different colors for the same data.
import { findCourseById } from "./curriculum";
import { TYT_SUBJECT_GROUPS } from "./curriculum/subject-groups";

export type GelisimHaritasiRow = {
  courseId: string;
  courseName: string;
  topicId: string;
  topicName: string;
  // count is wrongCount + blankCount, kept alongside them so heatTier's
  // existing threshold logic (and the coach panel's own tile text,
  // which only ever reads `count`) don't need to care about the split.
  count: number;
  wrongCount: number;
  blankCount: number;
  windowSize: number;
};

export type HeatTier = "hot" | "warm" | "cool";

// Middle of the requested "last 5-10 trials" range.
export const WINDOW_SIZE = 8;

export const HEAT_TIER_STYLES: Record<HeatTier, { tile: string; label: string }> = {
  hot: { tile: "border-rose-500/40 bg-rose-500/15 text-rose-700", label: "Kanayan Yara" },
  warm: { tile: "border-amber-500/40 bg-amber-500/15 text-amber-700", label: "Dikkat" },
  cool: { tile: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700", label: "Sağlam" },
};

// Same 40% threshold as the all-time map's tier(), kept identical on
// purpose so "red" means the same thing in both views.
export function heatTier(count: number, windowSize: number): HeatTier {
  if (count === 0) return "cool";
  if (windowSize <= 0) return "warm";
  return count / windowSize >= 0.4 ? "hot" : "warm";
}

// Mirrors the all-time map's own courseExamCounts convention: a
// general_exam counts toward every course in TYT_SUBJECT_GROUPS
// regardless of AYT/track -- not re-derived here, just matched for
// consistency between the two features.
const GENERAL_EXAM_COURSE_IDS = new Set(TYT_SUBJECT_GROUPS.flatMap((g) => g.courseIds));

export type TrialExam = { id: string; task_date: string; task_type: string; course_id: string | null };
// status is optional so an existing caller that doesn't select it (the
// coach panel's own fetch, which never reads wrongCount/blankCount)
// keeps type-checking unchanged -- an absent status is treated as
// "wrong" below, matching this table's own column default.
export type TopicMistakeRow = { task_id: string; course_id: string; topic_id: string; status?: "wrong" | "blank" };

// Windows each course to its most recent WINDOW_SIZE relevant trials
// (branch_exam for that course, or any general_exam if the course is in
// TYT_SUBJECT_GROUPS), then counts how many of those windowed trials
// tagged a mistake for each of that course's topics. Deliberately a
// fresh computation, not a re-slice of the all-time map -- that one's
// aggregation intentionally discards per-exam ordering/dates.
export function computeGelisimHaritasi(
  courseIds: string[],
  exams: TrialExam[],
  mistakeRows: TopicMistakeRow[],
): GelisimHaritasiRow[] {
  // task_id+course_id+topic_id is unique in student_task_topic_mistakes,
  // so at most one status per key -- a plain Map (not Map<string, Set>)
  // is enough to hold it.
  const mistakesByTask = new Map<string, Map<string, "wrong" | "blank">>();
  for (const m of mistakeRows) {
    const byKey = mistakesByTask.get(m.task_id) ?? new Map<string, "wrong" | "blank">();
    byKey.set(`${m.course_id}::${m.topic_id}`, m.status ?? "wrong");
    mistakesByTask.set(m.task_id, byKey);
  }

  const rows: GelisimHaritasiRow[] = [];
  for (const courseId of courseIds) {
    const course = findCourseById(courseId);
    if (!course) continue;

    const relevant = exams
      .filter(
        (e) =>
          (e.task_type === "branch_exam" && e.course_id === courseId) ||
          (e.task_type === "general_exam" && GENERAL_EXAM_COURSE_IDS.has(courseId)),
      )
      .sort((a, b) => (a.task_date < b.task_date ? 1 : a.task_date > b.task_date ? -1 : 0))
      .slice(0, WINDOW_SIZE);
    const windowSize = relevant.length;

    for (const unit of course.units) {
      for (const topic of unit.topics) {
        const key = `${courseId}::${topic.id}`;
        let wrongCount = 0;
        let blankCount = 0;
        for (const e of relevant) {
          const status = mistakesByTask.get(e.id)?.get(key);
          if (status === "wrong") wrongCount++;
          else if (status === "blank") blankCount++;
        }
        rows.push({
          courseId,
          courseName: course.name,
          topicId: topic.id,
          topicName: topic.name,
          count: wrongCount + blankCount,
          wrongCount,
          blankCount,
          windowSize,
        });
      }
    }
  }
  return rows;
}
