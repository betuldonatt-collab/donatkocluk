// "Gelişim Haritası" (growth map) heatmap computation -- a windowed
// sibling of the coach's all-time "Konu Performans Haritası"
// (app/coach/students/[id]/_components/topic-performance-map.tsx). Pure,
// stateless computation over already-fetched plain data (no Supabase
// client, no auth) -- shared across panels rather than duplicated, unlike
// the UI components that render it, since a drifted copy here would mean
// the coach and student literally see different colors for the same data.
// There is no cap on the number of exams: a map covers EVERY exam the caller hands it, so the caller's date range (or its
// absence, for the all-time map) is the only window -- and the maps, the Aylık Karne and the all-time map can never disagree
// on what a trial is.
import {
  courseDisplayName,
  findCourseById,
  isBranchExamMacroCourseId,
  isLgsCourseId,
  macroSourceCourseIds,
  macroTopicCourseId,
} from "./curriculum";
import { generalExamTabs, type SubjectScores } from "./exam-detail";
import { lgsSelectionNodes } from "./curriculum/lgs-selection";
import { courseHasBuckets, maarifSelectionNodes } from "./curriculum/maarif-selection";
import { MAARIF_TYT_MERGED_COURSES } from "./curriculum/maarif-tyt";
import { LGS_SUBJECT_GROUPS, MAARIF7_SUBJECT_GROUPS, TYT_SUBJECT_GROUPS } from "./curriculum/subject-groups";

export type GelisimHaritasiRow = {
  courseId: string;
  courseName: string;
  topicId: string;
  topicName: string;
  // How many (trial, topic) pairs carried a mistake -- a topic marked both
  // Yanlış and Boş in ONE trial counts once here (so count/windowSize stays a
  // share of trials), while wrongCount and blankCount each still count that
  // trial. Kept alongside them so heatTier's threshold logic (and the coach
  // panel's own tile text, which only ever reads `count`) don't need to care
  // about the split.
  count: number;
  wrongCount: number;
  blankCount: number;
  windowSize: number;
  // Titles of the trials in which this topic was marked (the all-time Konu Performans Haritası lists them).
  examTitles: string[];
  // What the window is made of, for the course's header line: "3 Genel Deneme", "2 TYT Fizik Branş", "1 TYT Fen Branş" ...
  // Same for every row of one course.
  breakdown: { label: string; count: number }[];
};

export type HeatTier = "hot" | "warm" | "cool";

// Which exams a map looks at: everything the course appears in, only Genel Denemeler, or only Branş Denemeleri (single and combined).
export type TrialSource = "all" | "general" | "branch";

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

// Fallback for a general exam that arrives WITHOUT its title (older callers / fixtures): it counts toward every course of
// the cohorts below, as it always did. With a title, the exam's own track decides (see examCoverage).
// LGS's six subjects join the set: a general exam counts toward every course
// of ITS cohort. That's safe across cohorts because callers pass only their
// own student's cohort course ids, so an LGS student is never evaluated
// against TYT courses (or vice versa).
const GENERAL_EXAM_COURSE_IDS = new Set([
  ...TYT_SUBJECT_GROUPS.flatMap((g) => g.courseIds),
  ...LGS_SUBJECT_GROUPS.flatMap((g) => g.courseIds),
  // The 7th grade's Genel Deneme covers its six courses (maarif7-*), like LGS's does.
  ...MAARIF7_SUBJECT_GROUPS.flatMap((g) => g.courseIds),
  // The 11th grade's Genel Deneme is analysed against the merged Maarif TYT courses.
  ...MAARIF_TYT_MERGED_COURSES.map((c) => c.id),
]);

export type TrialExam = {
  id: string;
  task_date: string;
  task_type: string;
  course_id: string | null;
  // The next three are optional so a caller that does not have them keeps working (it then gets the old, coarser behaviour):
  // the title and scores tell which courses a general exam covers (TYT vs AYT Sayısal / EA / Sözel, a Maarif grade, LGS), and
  // an exam whose topic analysis is still pending is left out of every window.
  title?: string;
  subject_scores?: SubjectScores | null;
  analysis_pending?: boolean;
};
// status is optional so an existing caller that doesn't select it (the
// coach panel's own fetch, which never reads wrongCount/blankCount)
// keeps type-checking unchanged -- an absent status is treated as
// "wrong" below, matching this table's own column default.
export type TopicMistakeRow = { task_id: string; course_id: string; topic_id: string; status?: "wrong" | "blank" };

export type TrialOptions = {
  // Default "all".
  source?: TrialSource;
};

// The atomic courses one exam is ABOUT -- the courses whose topic map it is a trial of:
//  - a single Branş exam: its own course;
//  - a combined ("macro") Branş exam: the courses it is made of (TYT Fen -> Fizik, Kimya, Biyoloji);
//  - a Genel Deneme: the subjects of ITS track (TYT / AYT Sayısal-EA-Sözel / LGS / a Maarif grade), restricted to the subjects
//    that have a score when the exam recorded per-subject scores.
// Null = unknown (a general exam without a title): the caller falls back to GENERAL_EXAM_COURSE_IDS.
function examCoverage(e: TrialExam, markedCourseIds: Set<string>): Set<string> | null {
  if (e.task_type === "branch_exam") {
    if (!e.course_id) return new Set();
    const macro = macroSourceCourseIds(e.course_id);
    return new Set(macro.length > 0 ? macro : [e.course_id]);
  }
  if (e.task_type !== "general_exam" || e.title === undefined) return null;

  const scores = e.subject_scores ?? null;
  const hasScores = !!scores && Object.values(scores).some((v) => !!v);
  const covered = new Set<string>();
  for (const tab of generalExamTabs({ title: e.title, subject_scores: scores })) {
    if (hasScores && !scores?.[tab.scoreKey]) continue;
    for (const c of tab.courses) covered.add(c.id);
  }
  // A course the student actually marked topics for in this exam is covered whatever the scores say.
  for (const id of markedCourseIds) covered.add(id);
  return covered;
}

// Collects, per course, EVERY relevant trial among `exams` (the caller bounds them -- by date range, or not at all), then
// counts how many of those trials tagged a mistake for each of that course's topics. ONE merged view per course: a course's
// trials are every exam about it, whatever kind --
// Genel Denemeler of its track, combined Branş exams it is part of ("TYT Fen" for Fizik), and its own single Branş exams.
// A combined exam's marks are stored under the macro course id (same topic ids), so they are folded back onto the atomic
// course here, at read time -- nothing stored changes. Exams whose topic analysis is still pending are left out entirely (they
// have no marks yet, so counting them would only make every topic look healthy). Combined courses themselves get no rows: the
// atomic subjects carry everything. Deliberately a fresh computation, not a re-slice of anything else -- aggregation elsewhere
// intentionally discards per-exam ordering/dates.
export function computeGelisimHaritasi(
  courseIds: string[],
  exams: TrialExam[],
  mistakeRows: TopicMistakeRow[],
  options: TrialOptions = {},
): GelisimHaritasiRow[] {
  const source = options.source ?? "all";

  // A topic can carry BOTH a Yanlış and a Boş mark in the same exam (one row
  // per status, see lib/topic-mistakes.ts), so each key holds a set of statuses.
  const mistakesByTask = new Map<string, Map<string, Set<"wrong" | "blank">>>();
  const markedCoursesByTask = new Map<string, Set<string>>();
  for (const m of mistakeRows) {
    // A mark on a combined exam belongs to the atomic course that owns the topic.
    const courseId = macroTopicCourseId(m.course_id, m.topic_id) ?? m.course_id;
    const byKey = mistakesByTask.get(m.task_id) ?? new Map<string, Set<"wrong" | "blank">>();
    const key = `${courseId}::${m.topic_id}`;
    const statuses = byKey.get(key) ?? new Set<"wrong" | "blank">();
    statuses.add(m.status ?? "wrong");
    byKey.set(key, statuses);
    mistakesByTask.set(m.task_id, byKey);
    const marked = markedCoursesByTask.get(m.task_id) ?? new Set<string>();
    marked.add(courseId);
    markedCoursesByTask.set(m.task_id, marked);
  }

  const newestFirst = exams
    .filter((e) => (e.task_type === "branch_exam" || e.task_type === "general_exam") && !e.analysis_pending)
    .filter((e) => source === "all" || (source === "general") === (e.task_type === "general_exam"))
    .sort((a, b) => (a.task_date < b.task_date ? 1 : a.task_date > b.task_date ? -1 : 0));
  const coverage = new Map<string, Set<string> | null>(
    newestFirst.map((e) => [e.id, examCoverage(e, markedCoursesByTask.get(e.id) ?? new Set<string>())]),
  );
  const covers = (e: TrialExam, courseId: string): boolean => {
    const cov = coverage.get(e.id);
    if (cov) return cov.has(courseId);
    return e.task_type === "general_exam" && GENERAL_EXAM_COURSE_IDS.has(courseId);
  };

  // What one trial is called in a course's header line.
  const trialLabel = (e: TrialExam): string => {
    if (e.task_type === "general_exam") return "Genel Deneme";
    const own = e.course_id ? findCourseById(e.course_id) : null;
    return `${own ? courseDisplayName(own.id, own.name) : "Branş"} Branş`;
  };

  const rows: GelisimHaritasiRow[] = [];
  for (const courseId of courseIds) {
    // The combined courses are views over their atomic subjects now -- every trial already lands on those.
    if (isBranchExamMacroCourseId(courseId)) continue;
    const course = findCourseById(courseId);
    if (!course) continue;

    const relevant = newestFirst.filter((e) => covers(e, courseId));
    const windowSize = relevant.length;
    const tally = new Map<string, number>();
    for (const e of relevant) {
      const label = trialLabel(e);
      tally.set(label, (tally.get(label) ?? 0) + 1);
    }
    const breakdown = [...tally.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

    // An LGS course reports at its selection-node granularity (see
    // lib/curriculum/lgs-selection.ts) -- a rolled-up node's mistake count
    // sums every one of its now-hidden Alt Konu/topic members, so a
    // mistake tagged against any of them (old data, tagged before this
    // rollup, or new data tagged directly against the node's own
    // representative id) still counts toward the same tile. Every
    // non-LGS course keeps reporting one row per raw topic, unchanged.
    const nodes = isLgsCourseId(courseId)
      ? lgsSelectionNodes(course)
      : courseHasBuckets(course)
        ? maarifSelectionNodes(course)
        : course.units.flatMap((u) =>
          u.topics.map((t) => ({
            id: t.id,
            // An LGS Alt Konu ("EKOK") means nothing without its Konu --
            // moot here since no non-LGS course has a konu level, but kept
            // for parity with topicOptionsForCourse's own naming.
            label: u.konu ? `${u.konu} › ${t.name}` : t.name,
            memberTopicIds: [t.id],
          })),
        );

    for (const node of nodes) {
      let count = 0;
      let wrongCount = 0;
      let blankCount = 0;
      const examTitles: string[] = [];
      for (const e of relevant) {
        const byKey = mistakesByTask.get(e.id);
        let markedHere = false;
        for (const memberId of node.memberTopicIds) {
          const statuses = byKey?.get(`${courseId}::${memberId}`);
          if (!statuses) continue;
          count++;
          markedHere = true;
          if (statuses.has("wrong")) wrongCount++;
          if (statuses.has("blank")) blankCount++;
        }
        if (markedHere) examTitles.push(e.title ?? "");
      }
      rows.push({
        courseId,
        courseName: course.name,
        topicId: node.id,
        topicName: node.label,
        count,
        wrongCount,
        blankCount,
        windowSize,
        examTitles,
        breakdown,
      });
    }
  }
  return rows;
}
