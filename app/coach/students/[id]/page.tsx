import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { fetchSchoolExams } from "@/lib/school-exams-data";
import { usesPhotoWorkflow } from "@/lib/photo-workflow";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { sessionBalance } from "@/lib/session-balance";
import { createClient } from "@/lib/supabase/server";
import { KARMA_TOPIC_ID, findCourseById, isLgsCourseId } from "@/lib/curriculum";
import { curriculumCourseIdsFor, generalExamCourseIdsForTitle } from "@/lib/curriculum/cohort";
import { lgsNodeIdForTopicId, lgsSelectionNodes } from "@/lib/curriculum/lgs-selection";
import { courseHasBuckets, maarifSelectionNodes } from "@/lib/curriculum/maarif-selection";
import { groupPipelineRows, pipelineConfigFor, pipelineSelectColumns, type PipelineRow } from "@/lib/topic-pipeline";
import { weekDates } from "@/lib/date";
import { nextCycleRange } from "@/lib/karne";
import type { ExamType } from "@/lib/exam-type";
import { STUDENT_NOTES_PAGE_SIZE } from "./constants";
import { getPendingFocusReviews, type CoachReportCardRow, type StudentFixedTask } from "../../actions";
import { DetailTabs } from "./_components/detail-tabs";
import type { DayStat } from "./_components/daily-stats-summary";
import type { CourseResourceData } from "./_components/kaynak-takibi-tab";
import { MissingTasksCard } from "./_components/missing-tasks-card";
import { PendingFocusReviewsCard } from "./_components/pending-focus-reviews-card";
import { findMissingTasks } from "@/lib/missing-tasks";
import { ProfileOverviewCard } from "./_components/profile-overview-card";
import { LgsExamHistory } from "@/components/lgs-exam-history";
import { buildLgsExamHistory } from "@/lib/lgs-exam";
import { StudentTimelineCard } from "./_components/student-timeline-card";
import { resolveCycles, tasksInCycle, type CycleWindow, type ProgressLock } from "@/lib/completion";
import { TargetsCompletionCard } from "./_components/targets-completion-card";
import type { TopicPerformanceRow } from "./_components/topic-performance-map";
import type { WeakTopicRow } from "./weak-topic-map";
import type {
  CompletionStats,
  DetailCoachNote,
  DetailSession,
  DetailTask,
  DualCompletionStats,
  LgsDailyRoutine,
  ParagrafProblemEntry,
  StudentProfile,
  SubjectCompletion,
} from "./types";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDays(referenceIso: string) {
  return weekDates(referenceIso).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[i]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

function classifyTrack(task: DetailTask): "tyt" | "ayt" | "other" {
  // Genel Deneme has no course_id -- its TYT/AYT track lives only in the
  // title text ("TYT Genel Deneme - ..." / "AYT Genel Deneme - ..."),
  // per the coach's request to avoid a dedicated column for it.
  if (task.task_type === "general_exam") {
    const title = task.title.toUpperCase();
    if (title.startsWith("LGS")) return "other";
    return title.startsWith("AYT") ? "ayt" : "tyt";
  }
  if (task.course_id?.startsWith("tyt-")) return "tyt";
  if (task.course_id?.startsWith("ayt-")) return "ayt";
  return "other";
}

// Program completion ("Haftalık") counts only what is due so far this week
// (Monday..today, lib/completion.ts) -- tasks scheduled for tomorrow or
// later are in neither the numerator nor the denominator. The "Genel"
// (all-time) figure is the exact same bucketing, just over every task ever
// assigned through today instead of only this week's -- see
// computeDualCompletionStats below, which runs this over both slices.
function bucketCompletionStats(tasks: DetailTask[]): CompletionStats {
  const buckets = {
    overall: { done: 0, total: 0 },
    tyt: { done: 0, total: 0 },
    ayt: { done: 0, total: 0 },
  };
  for (const t of tasks) {
    buckets.overall.total += 1;
    if (t.status === "done") buckets.overall.done += 1;
    const track = classifyTrack(t);
    if (track === "tyt" || track === "ayt") {
      buckets[track].total += 1;
      if (t.status === "done") buckets[track].done += 1;
    }
  }
  const pct = (b: { done: number; total: number }) => (b.total > 0 ? Math.round((b.done / b.total) * 100) : null);
  return { overall: pct(buckets.overall), tyt: pct(buckets.tyt), ayt: pct(buckets.ayt) };
}

function computeDualCompletionStats(allTasks: DetailTask[], today: string, currentCycle: CycleWindow): DualCompletionStats {
  return {
    weekly: bucketCompletionStats(tasksInCycle(allTasks, currentCycle)),
    allTime: bucketCompletionStats(allTasks.filter((t) => t.task_date <= today)),
  };
}

// Per-course breakdown (e.g. "TYT Matematik %72") -- routine pseudo-courses
// (paragraf/problem) aren't real curriculum subjects, so they're excluded
// here even though they're valid course_ids elsewhere in the app.
function bucketSubjectCompletion(tasks: DetailTask[]): Map<string, { courseName: string; done: number; total: number }> {
  const buckets = new Map<string, { courseName: string; done: number; total: number }>();
  for (const t of tasks) {
    if (!t.course_id || t.course_id === "paragraf" || t.course_id === "problem") continue;
    const bucket = buckets.get(t.course_id) ?? { courseName: courseLabelFor(t.course_id), done: 0, total: 0 };
    bucket.total += 1;
    if (t.status === "done") bucket.done += 1;
    buckets.set(t.course_id, bucket);
  }
  return buckets;
}

function courseLabelFor(courseId: string): string {
  const course = findCourseById(courseId);
  const prefix = courseId.startsWith("tyt-") ? "TYT " : courseId.startsWith("ayt-") ? "AYT " : "";
  return `${prefix}${course?.name ?? courseId}`;
}

// Merges the weekly and all-time per-course buckets into one row per
// course touched in EITHER scope -- a course only worked on in a prior
// week still shows its all-time figure with "—" for this week's, and vice
// versa for a course picked up for the first time this week.
function computeSubjectCompletion(allTasks: DetailTask[], today: string, currentCycle: CycleWindow): SubjectCompletion[] {
  const weekly = bucketSubjectCompletion(tasksInCycle(allTasks, currentCycle));
  const allTime = bucketSubjectCompletion(allTasks.filter((t) => t.task_date <= today));
  const courseIds = new Set([...weekly.keys(), ...allTime.keys()]);
  const toBucket = (b: { done: number; total: number } | undefined) =>
    b ? { pct: Math.round((b.done / b.total) * 100), done: b.done, total: b.total } : { pct: null, done: 0, total: 0 };

  return [...courseIds]
    .map((courseId) => ({
      courseId,
      courseName: (weekly.get(courseId) ?? allTime.get(courseId))!.courseName,
      weekly: toBucket(weekly.get(courseId)),
      allTime: toBucket(allTime.get(courseId)),
    }))
    .sort((a, b) => a.courseName.localeCompare(b.courseName, "tr"));
}

async function fetchStudentDetail(studentId: string) {
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", studentId).maybeSingle();
  if (!profile) return null;

  // The cohort decides which curriculum the analytics below cover.
  const examType: ExamType = profile.exam_type === "LGS" ? "LGS" : "YKS";
  const maarifGrade = await fetchMaarifGrade(supabase, studentId);
  // A 7th/9th/10th grader's maps (Konu Performans, Gelişim Haritası) cover that grade's own courses.
  const curriculumCourseIds = curriculumCourseIdsFor(examType, maarifGrade);
  // Yazılılar: best-effort (null for a graduate; never throws), so it can't take the page down.
  const schoolExams = await fetchSchoolExams(supabase, studentId, { examType, maarifGrade });

  const today = todayISO();
  const weekDays = getWeekDays(today);

  const [
    { data: allTasks },
    { data: sessionRows },
    { data: lastLockRow },
    { data: paragrafRows },
    { data: weekTaskRows },
    { data: resourceRows },
    { data: progressRows },
    { data: noteRows },
    { data: taskResourceRows },
    { data: dailyStatsRows },
    { data: reportCardRows },
    { data: topicStatsRows },
    { data: fixedTaskRows },
  ] = await Promise.all([
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", studentId)
        .order("task_date", { ascending: false }),
      supabase
        .from("coaching_sessions")
        .select("*")
        .eq("student_id", studentId)
        .order("scheduled_at", { ascending: false }),
      // The single most recent progress lock -- where the completion
      // percentages currently start counting (lib/completion.ts). No lock
      // yet -> resolved below from the student's first completed session.
      supabase
        .from("progress_locks")
        .select("period_start, locked_at")
        .eq("student_id", studentId)
        .order("locked_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("paragraf_problem_entries")
        .select("*")
        .eq("student_id", studentId)
        .order("entry_date", { ascending: true }),
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", studentId)
        .gte("task_date", weekDays[0].date)
        .lte("task_date", weekDays[6].date)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resources")
        .select("id, name, course_id, is_active, kind, total_stock, remaining_stock")
        .eq("student_id", studentId)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resource_progress")
        .select("course_id, topic_id, resource_id, solved, reviewed, total_questions, correct_answers, incorrect_answers")
        .eq("student_id", studentId),
      supabase
        .from("coach_notes")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .range(0, STUDENT_NOTES_PAGE_SIZE - 1),
      supabase
        .from("task_resources")
        .select("task_id, resource_id, order_index, student_tasks!inner(student_id)")
        .eq("student_tasks.student_id", studentId)
        .order("order_index", { ascending: true }),
      supabase
        .from("student_daily_stats")
        .select("entry_date, total_count, correct_count, wrong_count, empty_count")
        .eq("student_id", studentId)
        .gte("entry_date", weekDays[0].date)
        .lte("entry_date", weekDays[6].date),
      supabase
        .from("student_report_cards")
        .select("*")
        .eq("student_id", studentId)
        .order("cycle_number", { ascending: false }),
      // Phase 2 rollup (migration 0072): a fixed-size cache of lifetime
      // per-(course, topic) totals, maintained incrementally by every
      // student_tasks write site rather than recomputed here from
      // approvedTasks -- bounded by distinct topics ever touched, not by
      // how many years of task history exist.
      supabase
        .from("student_topic_stats")
        .select("course_id, topic_id, total_count, correct_count, wrong_count, empty_count")
        .eq("student_id", studentId),
      // "Sabit Görevler" -- week-independent (no date range), the Program
      // tab's own manager list.
      supabase
        .from("student_fixed_tasks")
        .select("*")
        .eq("student_id", studentId)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

  // coaching_start_date is so often never set that generateCycleReportCard
  // (app/coach/actions.ts) falls back to the coach_students roster-link's
  // own created_at -- fetched here too, purely so the Karneler tab's date
  // range picker can default to the same "next cycle" range the server
  // would have auto-computed. RLS already scopes this to the caller's own
  // link (or an admin's), no explicit coach_id filter needed, matching
  // every other query above.
  const { data: coachLink } = await supabase.from("coach_students").select("created_at").eq("student_id", studentId).maybeSingle();

  // LGS students log Paragraf + Kitap Okuma in lgs_daily_routines (migration
  // 0087) rather than paragraf_problem_entries.
  // A 7th grader does the same (Paragraf / Kitap Okuma, migration 0122).
  const { data: lgsRoutineRows } =
    examType === "LGS" || maarifGrade === 7
      ? await supabase
          .from("lgs_daily_routines")
          .select("id, entry_date, paragraf_correct, paragraf_wrong, paragraf_empty, paragraf_duration_minutes, book_title, book_author, book_pages_read")
          .eq("student_id", studentId)
          .order("entry_date", { ascending: true })
      : { data: [] };

  // Per-topic pipeline ticks (the student's cohort table: LGS 4 steps, YKS
  // 2, Maarif 3), keyed course -> topic. A missing table reads as empty.
  const pipelineConfig = pipelineConfigFor(examType, maarifGrade);
  const { data: pipelineRows, error: pipelineError } = await supabase
    .from(pipelineConfig.table)
    .select(pipelineSelectColumns(pipelineConfig))
    .eq("student_id", studentId);
  if (pipelineError) console.error("[coach student detail] pipeline read failed:", pipelineError);
  const pipelineByCourse = groupPipelineRows((pipelineRows ?? []) as unknown as PipelineRow[], pipelineConfig);

  const resourceIdsByTask = new Map<string, string[]>();
  for (const row of taskResourceRows ?? []) {
    const list = resourceIdsByTask.get(row.task_id) ?? [];
    list.push(row.resource_id);
    resourceIdsByTask.set(row.task_id, list);
  }
  const tasks = (allTasks ?? []).map((t) => ({ ...t, resource_ids: resourceIdsByTask.get(t.id) ?? [] })) as DetailTask[];
  // All-time tracked minutes for the Karneler tab's own stat card -- reuses
  // this same already-fetched full-history `allTasks` (no new query).
  // tracked_duration_seconds only ever grows from a real completed Focus
  // Timer session (never a target), so unlike total_count/correct_count it
  // needs no status filter -- summing across every task, any status, is
  // already exactly "real time tracked."
  const allTimeTrackedMinutes = Math.floor(
    (allTasks ?? []).reduce((sum, t) => sum + (t.tracked_duration_seconds ?? 0), 0) / 60,
  );
  // Soft coach approval: a student's own pending self-created entry
  // (is_coach_assigned: false, is_approved_by_coach: false) is excluded
  // from the Kaynak Takibi and Gelişim Haritası aggregations below until
  // approveStudentTask (app/coach/actions.ts) reviews it -- it still
  // shows up in `tasks` itself (program completion, raw exam lists,
  // etc.), only the analytics rollups read this narrower list.
  const approvedTasks = tasks.filter((t) => t.is_coach_assigned || t.is_approved_by_coach);
  // A coach assigning a task can set total_count as the PLAN (e.g. "solve
  // 20 questions") before the student has touched it -- status stays
  // 'pending' until they actually do. Question-distribution/topic-
  // performance aggregations must only ever reflect real, self-reported
  // work: 'done' (fully completed, whatever counts the student entered
  // are the real result) or 'half_done' (partial, but still genuine --
  // whatever was actually attempted). 'pending' (untouched plan) and
  // 'not_done' (explicitly skipped) both get excluded -- any total_count
  // still sitting on either of those is the coach's original plan, not a
  // result. Applies uniformly to every task type, including "Ekstra
  // Çalışma" -- there's nothing task-type-specific here, only completion
  // state.
  const isCompletedTask = (t: DetailTask) => t.status === "done" || t.status === "half_done";
  const sessions = (sessionRows ?? []) as DetailSession[];
  // No lock yet -> the student's soonest still-pending session anchors the
  // bootstrap two-week window instead (lib/completion.ts).
  const upcomingSessionAt = sessions
    .filter((s) => s.outcome === "pending")
    .reduce<string | null>((soonest, s) => (soonest === null || s.scheduled_at < soonest ? s.scheduled_at : soonest), null);
  const { current: currentCycle } = resolveCycles(lastLockRow as ProgressLock | null, upcomingSessionAt, today);
  const paragrafEntries = (paragrafRows ?? []) as ParagrafProblemEntry[];
  const notes = (noteRows ?? []) as DetailCoachNote[];

  const EMPTY_TOPIC_STATS = { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } };
  const courseResourceData: CourseResourceData = {};
  function courseEntry(courseId: string) {
    return (courseResourceData[courseId] ??= {
      resources: [],
      branchExamResources: [],
      progress: {},
      topicStats: structuredClone(EMPTY_TOPIC_STATS),
    });
  }
  for (const [courseId, pipeline] of Object.entries(pipelineByCourse)) {
    courseEntry(courseId).pipeline = pipeline;
  }
  for (const row of resourceRows ?? []) {
    const entry = courseEntry(row.course_id);
    // Branch-trial resources are inventory, not topic-checklist material
    // -- they never show up in the solved/reviewed matrix, only in the
    // separate stock table (branchExamResources).
    if (row.kind === "branch_exam") {
      entry.branchExamResources.push({
        id: row.id,
        name: row.name,
        total_stock: row.total_stock ?? 0,
        remaining_stock: row.remaining_stock ?? 0,
        is_active: row.is_active,
      });
    } else {
      entry.resources.push({ id: row.id, name: row.name, is_active: row.is_active });
    }
  }
  for (const row of progressRows ?? []) {
    const entry = courseEntry(row.course_id);
    entry.progress[`${row.topic_id}::${row.resource_id}`] = { solved: row.solved, reviewed: row.reviewed };
  }
  // Sourced from student_topic_stats (migration 0072) instead of
  // iterating approvedTasks -- that rollup already applies the exact same
  // counting rule (isCompletedTask + coach-provenanced + course_id/
  // total_count present) at write time, so this is just shaping its rows
  // into the same { byTopic, karma } structure the Kaynak Takibi tab
  // already expects. "karma" is a real, selectable topic (KARMA_TOPIC_ID,
  // lib/curriculum) meaning "mixed topics", not the absence of one -- the
  // rollup already folds a null raw topic_id into it, so topic_id here is
  // always a real value, never null.
  //
  // A zero-total row is skipped for byTopic specifically (never created
  // in the old JS-aggregation version unless a task genuinely existed) --
  // it can linger in the rollup table after e.g. the one task that ever
  // populated a topic gets deleted, and the RPC zeroes rather than
  // deletes that bucket row. karma itself has no such skip: it's always
  // rendered (zero or not), matching its pre-existing "always present"
  // shape from EMPTY_TOPIC_STATS above.
  for (const row of topicStatsRows ?? []) {
    const entry = courseEntry(row.course_id);
    const stat = { total: row.total_count, correct: row.correct_count, wrong: row.wrong_count, empty: row.empty_count };
    if (row.topic_id === KARMA_TOPIC_ID) {
      entry.topicStats.karma = stat;
    } else if (row.total_count > 0) {
      entry.topicStats.byTopic[row.topic_id] = stat;
    }
  }

  const weekStats: DayStat[] = (dailyStatsRows ?? []).map((r) => ({
    date: r.entry_date,
    total: r.total_count,
    correct: r.correct_count,
    wrong: r.wrong_count,
    empty: r.empty_count,
  }));

  // Konu Performans Haritası must scan the student's ENTIRE exam history
  // -- a recency window can silently drop an entire track (e.g. AYT
  // branch exams pushed out by more frequent recent TYT ones).
  const allExams = approvedTasks.filter((t) => t.task_type === "branch_exam" || t.task_type === "general_exam");
  const allExamIds = allExams.map((e) => e.id);
  const { data: mistakeRows } =
    allExamIds.length > 0
      ? await supabase.from("student_task_topic_mistakes").select("task_id, course_id, topic_id").in("task_id", allExamIds)
      : { data: [] };

  const examTitleById = new Map(allExams.map((e) => [e.id, e.title]));
  const counts = new Map<string, { courseId: string; topicId: string; count: number; examTitles: string[] }>();
  // A topic marked both Yanlış and Boş in one exam is two rows (migration
  // 0116) but one mistake for that exam -- counted once.
  const countedExamTopics = new Set<string>();
  for (const m of mistakeRows ?? []) {
    const key = `${m.course_id}::${m.topic_id}`;
    const examTopicKey = `${m.task_id}::${key}`;
    if (countedExamTopics.has(examTopicKey)) continue;
    countedExamTopics.add(examTopicKey);
    const examTitle = examTitleById.get(m.task_id) ?? "";
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      existing.examTitles.push(examTitle);
    } else {
      counts.set(key, { courseId: m.course_id, topicId: m.topic_id, count: 1, examTitles: [examTitle] });
    }
  }

  // Each course's own exam count (not a single global sample size) is
  // used as its topics' denominator, since a course tested in 2 exams
  // shouldn't be judged against how many exams exist for every other
  // course.
  const courseExamCounts = new Map<string, number>();
  for (const e of allExams) {
    if (e.task_type === "branch_exam" && e.course_id) {
      courseExamCounts.set(e.course_id, (courseExamCounts.get(e.course_id) ?? 0) + 1);
    }
    if (e.task_type === "general_exam") {
      // An LGS general exam covers every LGS course; a YKS one the TYT groups.
      // A general exam counts toward the courses of ITS cohort (LGS / 7th / 9th / 10th grade / TYT).
      const generalCourseIds = generalExamCourseIdsForTitle(e.title);
      for (const cid of generalCourseIds) {
        courseExamCounts.set(cid, (courseExamCounts.get(cid) ?? 0) + 1);
      }
    }
  }

  // Gelişim Haritası (the windowed sibling of the all-time map below) is
  // no longer computed here -- it now reruns client-side in
  // gelisim-haritasi-tab.tsx against the coach's live date-range filter
  // (DetailTabs), using the same allExams/mistakeRows this file already
  // sends down for other tabs (via generalExams/branchExams/examMistakes,
  // built further below) plus curriculumCourseIds, returned as-is.

  // Full-spectrum performance map: every topic in every curriculum course
  // (not just ones the student has actually been examined on yet), so the
  // coach can browse any course's chip and see a clean topic list -- a
  // 0-mistake topic is real "good news" signal, not just an absence of
  // data.
  const topicPerformance: (WeakTopicRow & { sampleSize: number })[] = curriculumCourseIds.flatMap((courseId) => {
    const course = findCourseById(courseId);
    if (!course) return [];
    const sampleSize = courseExamCounts.get(courseId) ?? 0;
    // An LGS course reports at its selection-node granularity (see
    // lib/curriculum/lgs-selection.ts) -- one row per Konu/Ünite/etc.
    // instead of one per raw Alt Konu/topic, summing every member's
    // mistake count so a mistake tagged on any of them (old data from
    // before this rollup, or new data tagged directly against the node's
    // own representative id) still counts toward the same row. Every
    // non-LGS course keeps its existing one-row-per-topic behavior.
    const nodes = isLgsCourseId(courseId)
      ? lgsSelectionNodes(course)
      : courseHasBuckets(course)
        ? maarifSelectionNodes(course)
        : course.units.flatMap((u) =>
          u.topics.map((t) => ({
            id: t.id,
            // LGS's Konu level is part of the name so same-named Alt Konu rows
            // under different Konu (e.g. "Örnekler") stay distinguishable --
            // moot here (no non-LGS course has a konu level) but kept for
            // parity with the LGS branch's own naming.
            label: u.konu ? `${u.konu} › ${t.name}` : t.name,
            memberTopicIds: [t.id],
          })),
        );
    return nodes.map((node) => {
      const count = node.memberTopicIds.reduce((n, id) => n + (counts.get(`${courseId}::${id}`)?.count ?? 0), 0);
      const examTitles = node.memberTopicIds.flatMap((id) => counts.get(`${courseId}::${id}`)?.examTitles ?? []);
      return {
        courseId,
        courseName: course.name,
        topicId: node.id,
        topicName: node.label,
        count,
        examTitles,
        sampleSize,
      };
    });
  }).sort((a, b) => b.count - a.count);

  // Topic-based question aggregation (distinct from the mistake-count
  // tiers above): total/correct/incorrect QUESTIONS solved per topic,
  // combining task-based practice (student_tasks) and book-based
  // practice (student_resource_progress) -- "how well did the student
  // grasp this topic", not "which book did it come from". A Karma task
  // contributes via its own per-topic breakdown rows instead of its own
  // (meaningless-per-topic) totals.
  const topicQuestionTotals = new Map<string, { total: number; correct: number; incorrect: number }>();
  function bumpQuestionTotals(courseId: string, topicId: string, total: number, correct: number, incorrect: number) {
    // Folds a stored topic_id onto its LGS selection node's representative
    // id first (a no-op for every non-LGS course, and for a topic_id that
    // already IS a node's own id) -- so topicPerformance's lookup by
    // `row.topicId` (also a node id) below finds this contribution
    // regardless of which of the node's now-hidden members it was
    // originally logged against.
    const course = findCourseById(courseId);
    const resolvedTopicId = course && isLgsCourseId(courseId) ? lgsNodeIdForTopicId(course, topicId) : topicId;
    const key = `${courseId}::${resolvedTopicId}`;
    const existing = topicQuestionTotals.get(key) ?? { total: 0, correct: 0, incorrect: 0 };
    existing.total += total;
    existing.correct += correct;
    existing.incorrect += incorrect;
    topicQuestionTotals.set(key, existing);
  }

  for (const t of approvedTasks) {
    if (!t.course_id || !t.topic_id || t.topic_id === "karma") continue;
    if (t.total_count === null && t.correct_count === null && t.wrong_count === null) continue;
    if (!isCompletedTask(t)) continue;
    // The denominator here must be what the student actually worked
    // through (Doğru+Yanlış+Boş), not t.total_count -- that's the coach's
    // ASSIGNED target, which a half_done task (computeAutoTaskStatus,
    // lib/count-fields.ts) is by definition short of. Using the target
    // made "Konu Performans Haritası" show e.g. "29/40 doğru" for a task
    // the student only actually attempted 35 of, silently mixing an
    // assigned goal into a map that's supposed to be pure solved-question
    // history.
    const solved = (t.correct_count ?? 0) + (t.wrong_count ?? 0) + (t.empty_count ?? 0);
    bumpQuestionTotals(t.course_id, t.topic_id, solved, t.correct_count ?? 0, t.wrong_count ?? 0);
  }

  // Karma tasks contribute their per-topic breakdown rows (below) instead
  // of a single total -- same completion requirement as the loop above,
  // so a still-pending karma task's breakdown (if any were ever entered
  // ahead of completion) doesn't leak into the aggregation either.
  const karmaTaskIds = approvedTasks.filter((t) => t.topic_id === "karma" && isCompletedTask(t)).map((t) => t.id);
  const { data: breakdownRows } =
    karmaTaskIds.length > 0
      ? await supabase
          .from("student_task_topic_breakdown")
          .select("course_id, topic_id, total_questions, correct_answers, incorrect_answers")
          .in("task_id", karmaTaskIds)
      : { data: [] };
  for (const b of breakdownRows ?? []) {
    bumpQuestionTotals(b.course_id, b.topic_id, b.total_questions, b.correct_answers, b.incorrect_answers);
  }

  for (const row of progressRows ?? []) {
    if (row.total_questions === null || row.total_questions === undefined) continue;
    bumpQuestionTotals(row.course_id, row.topic_id, row.total_questions, row.correct_answers ?? 0, row.incorrect_answers ?? 0);
  }

  const topicPerformanceWithQuestions: TopicPerformanceRow[] = topicPerformance.map((row) => {
    const q = topicQuestionTotals.get(`${row.courseId}::${row.topicId}`);
    return {
      ...row,
      questionTotal: q?.total ?? 0,
      questionCorrect: q?.correct ?? 0,
      questionIncorrect: q?.incorrect ?? 0,
    };
  });

  return {
    profile: profile as StudentProfile,
    maarifGrade,
    schoolExams,
    completion: computeDualCompletionStats(tasks, today, currentCycle),
    subjectCompletion: computeSubjectCompletion(tasks, today, currentCycle),
    progressFrom: currentCycle.start,
    progressTo: currentCycle.end,
    topicPerformance: topicPerformanceWithQuestions,
    curriculumCourseIds,
    sessions,
    notes,
    notesHasMore: notes.length === STUDENT_NOTES_PAGE_SIZE,
    paragrafEntries,
    lgsRoutines: (lgsRoutineRows ?? []) as LgsDailyRoutine[],
    examType,
    generalExams: tasks.filter((t) => t.task_type === "general_exam"),
    branchExams: tasks.filter((t) => t.task_type === "branch_exam"),
    examMistakes: mistakeRows ?? [],
    weekDays,
    weekTasks: (weekTaskRows ?? []) as DetailTask[],
    fixedTasks: (fixedTaskRows ?? []) as StudentFixedTask[],
    allTimeTrackedMinutes,
    // Only LGS tasks need a Kanıt Fotoğrafı (lib/lgs-completion.ts).
    missingTasks: findMissingTasks(tasks, today, { requiresPhoto: usesPhotoWorkflow({ examType, maarifGrade }) }),
    courseResourceData,
    today,
    weekStats,
    karneCycles: (reportCardRows ?? []) as CoachReportCardRow[],
    // reportCardRows is ordered cycle_number descending, so [0] is the
    // latest cycle -- same "chain off the last cycle" rule as
    // generateCycleReportCard's own default, computed here only to seed
    // the date range picker's initial value (the coach can freely change
    // it from there). Null when there's nothing to chain off of yet
    // (no coaching_start_date and no roster-link date either) -- the
    // picker just starts empty in that rare case.
    defaultKarneRange: (() => {
      const coachingStart = profile.coaching_start_date ?? coachLink?.created_at?.slice(0, 10) ?? null;
      if (!coachingStart) return null;
      return nextCycleRange(coachingStart, reportCardRows?.[0]?.range_end ?? null);
    })(),
  };
}

const DETAIL_TABS = ["analiz", "gelisim-haritasi", "grafikler", "program", "kaynak-takibi", "karneler", "yazililar", "gorusmeler"] as const;

export default async function CoachStudentDetailPage(props: PageProps<"/coach/students/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const tabParam = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
  const detail = await fetchStudentDetail(id);
  const maarifGrade = detail?.maarifGrade ?? null;
  // This student's Süre Tut sessions over 6 hours, waiting for the coach's
  // decision (best-effort: [] on failure). Only asked for once the student
  // resolved, i.e. is actually on this coach's roster.
  const focusReviews = detail ? await getPendingFocusReviews(id) : [];
  const examType: ExamType = detail?.profile.exam_type ?? "YKS";
  const initialTab = DETAIL_TABS.find((t) => t === tabParam) ?? "analiz";

  return (
    <MaarifGradeProvider value={maarifGrade}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/coach/students"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Öğrencilerim
        </Link>

        {!detail ? (
          <p className="text-muted-foreground text-sm">Öğrenci bulunamadı veya bu öğrenci sana atanmamış.</p>
        ) : (
          <>
            <header className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">{detail.profile.full_name ?? "İsimsiz Öğrenci"}</h1>
            </header>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <ProfileOverviewCard studentId={id} profile={detail.profile} remainingSessions={sessionBalance(detail.sessions).remaining} />
                  <TargetsCompletionCard
                    studentId={id}
                    profile={detail.profile}
                    completion={detail.completion}
                    subjectCompletion={detail.subjectCompletion}
                    progressFrom={detail.progressFrom}
                    progressTo={detail.progressTo}
                  />
                </div>

                <PendingFocusReviewsCard reviews={focusReviews} />

                <MissingTasksCard items={detail.missingTasks} studentId={id} />

                {examType === "LGS" && <LgsExamHistory exams={buildLgsExamHistory(detail.generalExams)} />}

                <DetailTabs
                  studentId={id}
                  topicPerformance={detail.topicPerformance}
                  curriculumCourseIds={detail.curriculumCourseIds}
                  paragrafEntries={detail.paragrafEntries}
                  generalExams={detail.generalExams}
                  branchExams={detail.branchExams}
                  initialWeekDays={detail.weekDays}
                  initialWeekTasks={detail.weekTasks}
                  initialFixedTasks={detail.fixedTasks}
                  courseResourceData={detail.courseResourceData}
                  today={detail.today}
                  initialWeekStats={detail.weekStats}
                  karneCycles={detail.karneCycles}
                  defaultKarneRange={detail.defaultKarneRange}
                  allTimeTrackedMinutes={detail.allTimeTrackedMinutes}
                  initialTab={initialTab}
                  examType={examType}
                  lgsRoutines={detail.lgsRoutines}
                  examMistakes={detail.examMistakes}
                  sessions={detail.sessions}
                  schoolExams={detail.schoolExams}
                />
              </div>

              <div className="lg:col-span-1">
                <StudentTimelineCard
                  studentId={id}
                  notes={detail.notes}
                  sessions={detail.sessions}
                  initialHasMore={detail.notesHasMore}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </MaarifGradeProvider>
  );
}
