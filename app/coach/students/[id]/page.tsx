import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { fetchSchoolExams } from "@/lib/school-exams-data";
import { bridgeProblemRoutine } from "@/lib/curriculum/problemler";
import { AytTrackProvider } from "@/components/ayt-track-context";
import { usesPhotoWorkflow } from "@/lib/photo-workflow";
import Link from "next/link";
import { ArrowLeft, Images } from "lucide-react";

import { sessionBalance } from "@/lib/session-balance";
import { createClient } from "@/lib/supabase/server";
import { KARMA_TOPIC_ID, aytTrackOf, courseDisplayName, findCourseById, isLgsCourseId } from "@/lib/curriculum";
import { curriculumCourseIdsFor } from "@/lib/curriculum/cohort";
import { lgsNodeIdForTopicId } from "@/lib/curriculum/lgs-selection";
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
import { findMissingTasks, MISSING_TASKS_WINDOW_DAYS } from "@/lib/missing-tasks";
import { fetchAllPages } from "@/lib/paged-select";
import { ProfileOverviewCard } from "./_components/profile-overview-card";
import { LgsExamHistory } from "@/components/lgs-exam-history";
import { buildLgsExamHistory } from "@/lib/lgs-exam";
import { StudentTimelineCard } from "./_components/student-timeline-card";
import { completionPercent, resolveCycles, tasksInCycle, type CycleWindow, type ProgressLock } from "@/lib/completion";
import { TargetsCompletionCard } from "./_components/targets-completion-card";
import { completionLayoutFor, groupStats, type CompletionLayout } from "@/lib/program-completion-bars";
import { weightedCounts } from "@/lib/effort-weight";
import { studyStatusSelect } from "@/lib/task-study-status";
import type { TopicQuestionTotals } from "./_components/topic-performance-map";
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

// What the whole-history reads below carry per task: only the columns the completion percentages, the question totals
// and the tracked-time sum use -- never the heavy ones (subject scores, photo paths, descriptions, video links).
// (The completion rows also carry what the effort-weighted percentages need: the amount asked -- total_count / duration_minutes -- and
// the questions solved so far, which a half-done task is credited for.)
type CompletionRow = Pick<
  DetailTask,
  "task_date" | "status" | "task_type" | "title" | "course_id" | "total_count" | "duration_minutes" | "correct_count" | "wrong_count" | "empty_count"
> & { study_status?: string | null };
type HistoryTask = CompletionRow &
  Pick<DetailTask, "id" | "topic_id" | "is_coach_assigned" | "is_approved_by_coach"> & {
    tracked_duration_seconds: number | null;
  };
const HISTORY_COLUMNS =
  "id, task_date, task_type, title, course_id, topic_id, status, is_coach_assigned, is_approved_by_coach, total_count, duration_minutes, correct_count, wrong_count, empty_count, tracked_duration_seconds";

function classifyTrack(task: Pick<DetailTask, "task_type" | "title" | "course_id">): "tyt" | "ayt" | "other" {
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

// Program completion counts the tasks of a window (the current cycle, or everything assigned through today for "Genel") on the SAME
// effort-weighted math as every other percentage in the app (lib/effort-weight.ts): each task weighs its effort units -- the
// denominator, whatever its status -- and earns all of them when done, solved / target of them when half done, none when not done or
// pending. (It used to count one unit per task, which made this card disagree with the coach's roster, the parent and the student.)
function bucketCompletionStats(tasks: CompletionRow[]): CompletionStats {
  const pct = (rows: CompletionRow[]) => completionPercent(weightedCounts(rows));
  return {
    overall: pct(tasks),
    tyt: pct(tasks.filter((t) => classifyTrack(t) === "tyt")),
    ayt: pct(tasks.filter((t) => classifyTrack(t) === "ayt")),
  };
}

function computeDualCompletionStats(
  allTasks: CompletionRow[],
  today: string,
  currentCycle: CycleWindow,
  layout: CompletionLayout,
): DualCompletionStats {
  const weeklyTasks = tasksInCycle(allTasks, currentCycle);
  const allTimeTasks = allTasks.filter((t) => t.task_date <= today);
  return {
    weekly: bucketCompletionStats(weeklyTasks),
    allTime: bucketCompletionStats(allTimeTasks),
    // A Maarif / 7th grade / LGS student gets bars of its own cohort instead of TYT + AYT (lib/program-completion-bars.ts).
    layout: layout.kind === "groups" ? { kind: "groups", showOverall: layout.showOverall } : { kind: "standard" },
    groups: groupStats(layout, weeklyTasks, allTimeTasks),
  };
}

// Per-course breakdown (e.g. "TYT Matematik %72") -- routine pseudo-courses (paragraf/problem) aren't real curriculum subjects, so they're
// excluded here even though they're valid course_ids elsewhere in the app. Effort-weighted like every bar: done / total are effort units.
function bucketSubjectCompletion(tasks: CompletionRow[]): Map<string, { courseName: string; done: number; total: number }> {
  const byCourse = new Map<string, CompletionRow[]>();
  for (const t of tasks) {
    if (!t.course_id || t.course_id === "paragraf" || t.course_id === "problem") continue;
    byCourse.set(t.course_id, [...(byCourse.get(t.course_id) ?? []), t]);
  }
  const buckets = new Map<string, { courseName: string; done: number; total: number }>();
  for (const [courseId, rows] of byCourse) {
    const counts = weightedCounts(rows);
    buckets.set(courseId, { courseName: courseLabelFor(courseId), done: counts.done, total: counts.total });
  }
  return buckets;
}

function courseLabelFor(courseId: string): string {
  const course = findCourseById(courseId);
  return course ? courseDisplayName(courseId, course.name) : courseId;
}

// Merges the weekly and all-time per-course buckets into one row per
// course touched in EITHER scope -- a course only worked on in a prior
// week still shows its all-time figure with "—" for this week's, and vice
// versa for a course picked up for the first time this week.
function computeSubjectCompletion(allTasks: CompletionRow[], today: string, currentCycle: CycleWindow): SubjectCompletion[] {
  const weekly = bucketSubjectCompletion(tasksInCycle(allTasks, currentCycle));
  const allTime = bucketSubjectCompletion(allTasks.filter((t) => t.task_date <= today));
  const courseIds = new Set([...weekly.keys(), ...allTime.keys()]);
  const toBucket = (b: { done: number; total: number } | undefined) =>
    b ? { pct: completionPercent({ done: b.done, total: b.total }), done: Math.round(b.done), total: b.total } : { pct: null, done: 0, total: 0 };

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

  // Independent of each other, so one round trip instead of two.
  const [{ data: profile }, maarifGrade] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", studentId).maybeSingle(),
    fetchMaarifGrade(supabase, studentId),
  ]);
  if (!profile) return null;

  // The cohort decides which curriculum the analytics below cover.
  const examType: ExamType = profile.exam_type === "LGS" ? "LGS" : "YKS";
  // A 7th/9th/10th grader's maps (Konu Performans, Gelişim Haritası) cover that grade's own courses.
  const curriculumCourseIds = curriculumCourseIdsFor(examType, maarifGrade);
  // Per-topic pipeline ticks (the student's cohort table: LGS 4 steps, YKS 2, Maarif 3), keyed course -> topic.
  const pipelineConfig = pipelineConfigFor(examType, maarifGrade);

  const today = todayISO();
  const weekDays = getWeekDays(today);
  const missingFrom = new Date(`${today}T00:00:00Z`);
  missingFrom.setUTCDate(missingFrom.getUTCDate() - MISSING_TASKS_WINDOW_DAYS);
  const missingFromIso = missingFrom.toISOString().slice(0, 10);

  const historyStudyCol = await studyStatusSelect(supabase);
  const [
    { data: allTasks },
    { data: sessionRows },
    { data: lastLockRow },
    { data: paragrafRows },
    { data: weekTaskRows },
    { data: resourceRows },
    { data: progressRows },
    { data: noteRows },
    { data: examRows },
    { data: missingWindowRows },
    { data: dailyStatsRows },
    { data: reportCardRows },
    { data: topicStatsRows },
    { data: fixedTaskRows },
    schoolExams,
    { data: coachLink },
    { data: lgsRoutineRows },
    { data: pipelineRows, error: pipelineError },
  ] = await Promise.all([
      // The student's WHOLE task history, slim: only the columns the percentages / question totals need (HISTORY_COLUMNS),
      // read in pages so a long history is neither dragged over the wire as full rows nor cut at the API's row cap.
      fetchAllPages<HistoryTask>((from, to, withCount) =>
        supabase
          .from("student_tasks")
          .select(HISTORY_COLUMNS + historyStudyCol, withCount ? { count: "exact" } : undefined)
          .eq("student_id", studentId)
          .order("task_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: HistoryTask[] | null; error: unknown; count?: number | null }>,
      ),
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
      fetchAllPages((from, to, withCount) =>
        supabase
          .from("student_resource_progress")
          .select("course_id, topic_id, resource_id, solved, reviewed, total_questions, correct_answers, incorrect_answers", withCount ? { count: "exact" } : undefined)
          .eq("student_id", studentId)
          .order("topic_id", { ascending: true })
          .order("resource_id", { ascending: true })
          .range(from, to),
      ),
      supabase
        .from("coach_notes")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .range(0, STUDENT_NOTES_PAGE_SIZE - 1),
      // Full rows for the exam tasks only (the exam charts and analysis need subject scores etc.) ...
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", studentId)
        .in("task_type", ["general_exam", "branch_exam"])
        .order("task_date", { ascending: false }),
      // ... and for the look-back window of "Tamamlanmayan Görevler" (a week), not the whole history.
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", studentId)
        .gte("task_date", missingFromIso)
        .lt("task_date", today),
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
      fetchAllPages((from, to, withCount) =>
        supabase
          .from("student_topic_stats")
          .select("course_id, topic_id, total_count, correct_count, wrong_count, empty_count", withCount ? { count: "exact" } : undefined)
          .eq("student_id", studentId)
          .order("course_id", { ascending: true })
          .order("topic_id", { ascending: true })
          .range(from, to),
      ),
      // "Sabit Görevler" -- week-independent (no date range), the Program
      // tab's own manager list.
      supabase
        .from("student_fixed_tasks")
        .select("*")
        .eq("student_id", studentId)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
      // Yazılılar: best-effort (null for a graduate; never throws), so it can't take the page down.
      fetchSchoolExams(supabase, studentId, { examType, maarifGrade }),
      // coaching_start_date is so often never set that generateCycleReportCard (app/coach/actions.ts) falls back to
      // the coach_students roster-link's own created_at -- fetched here too, purely so the Karneler tab's date range
      // picker can default to the same "next cycle" range the server would have auto-computed. RLS already scopes
      // this to the caller's own link (or an admin's), no explicit coach_id filter needed.
      supabase.from("coach_students").select("created_at").eq("student_id", studentId).maybeSingle(),
      // LGS students log Paragraf + Kitap Okuma in lgs_daily_routines (migration 0087) rather than
      // paragraf_problem_entries; a 7th grader does the same (migration 0122).
      examType === "LGS" || maarifGrade === 7
        ? supabase
            .from("lgs_daily_routines")
            .select("id, entry_date, paragraf_correct, paragraf_wrong, paragraf_empty, paragraf_duration_minutes, book_title, book_author, book_pages_read")
            .eq("student_id", studentId)
            .order("entry_date", { ascending: true })
        : Promise.resolve({ data: [] as never[] }),
      // Per-topic pipeline ticks, in pages like every other whole-student list; a failure reads as empty (logged below).
      fetchAllPages<PipelineRow>(
        (from, to, withCount) =>
          supabase
            .from(pipelineConfig.table)
            .select(pipelineSelectColumns(pipelineConfig), withCount ? { count: "exact" } : undefined)
            .eq("student_id", studentId)
            .order("course_id", { ascending: true })
            .order("topic_id", { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: PipelineRow[] | null; error: unknown; count?: number | null }>,
      ),
    ]);

  // A missing pipeline table reads as empty.
  if (pipelineError) console.error("[coach student detail] pipeline read failed:", pipelineError);
  const pipelineByCourse = groupPipelineRows(pipelineRows ?? [], pipelineConfig);

  // Nothing on this page shows a task's linked resources outside the weekly board (which loads its own week), so the
  // whole-history task_resources join this used to run is gone; exam / missing-task rows carry an empty list, the same
  // way the dashboard's own exam rows do.
  const withNoResources = (rows: unknown[] | null) => (rows ?? []).map((t) => ({ ...(t as object), resource_ids: [] as string[] })) as DetailTask[];
  const tasks = (allTasks ?? []) as HistoryTask[];
  const examTasks = withNoResources(examRows);
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
  const isCompletedTask = (t: Pick<DetailTask, "status">) => t.status === "done" || t.status === "half_done";
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
  // The standalone "Problem" routine's results are TYT Matematik's "Problemler (Genel)" (lib/curriculum/problemler.ts)
  // -- only for a student whose Kaynak Takibi shows the TYT courses (a plain YKS student).
  bridgeProblemRoutine(courseResourceData, courseEntry, examType !== "LGS" && maarifGrade === null);

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
  // Karma tasks contribute their per-topic breakdown rows (aggregated further below) instead of a single total --
  // same completion requirement as the totals loop, so a still-pending karma task's breakdown (if any were ever entered
  // ahead of completion) doesn't leak into the aggregation either. Read together with the mistakes: independent queries.
  const karmaTaskIds = approvedTasks.filter((t) => t.topic_id === "karma" && isCompletedTask(t)).map((t) => t.id);
  const [{ data: mistakeRows }, { data: breakdownRows }] = await Promise.all([
    allExamIds.length > 0
      ? supabase.from("student_task_topic_mistakes").select("task_id, course_id, topic_id").in("task_id", allExamIds)
      : Promise.resolve({ data: [] as { task_id: string; course_id: string; topic_id: string }[] }),
    karmaTaskIds.length > 0
      ? supabase
          .from("student_task_topic_breakdown")
          .select("course_id, topic_id, total_questions, correct_answers, incorrect_answers")
          .in("task_id", karmaTaskIds)
      : Promise.resolve({ data: [] as { course_id: string; topic_id: string; total_questions: number; correct_answers: number; incorrect_answers: number }[] }),
  ]);

  // Konu Performans Haritası (all-time; every topic of every curriculum course, a 0-mistake topic being real "good news") is
  // computed in the browser from the exam history this page already ships (topic-performance-map.tsx, same computation as the
  // Gelişim Haritası, so it can offer the Tümü / Genel / Branş switch). The server only precomputes its question-level totals below.

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

  for (const b of breakdownRows ?? []) {
    bumpQuestionTotals(b.course_id, b.topic_id, b.total_questions, b.correct_answers, b.incorrect_answers);
  }

  for (const row of progressRows ?? []) {
    if (row.total_questions === null || row.total_questions === undefined) continue;
    bumpQuestionTotals(row.course_id, row.topic_id, row.total_questions, row.correct_answers ?? 0, row.incorrect_answers ?? 0);
  }

  const topicQuestionTotalsRecord: TopicQuestionTotals = Object.fromEntries(topicQuestionTotals);

  return {
    profile: profile as StudentProfile,
    maarifGrade,
    schoolExams,
    completion: computeDualCompletionStats(tasks, today, currentCycle, completionLayoutFor({ examType, maarifGrade })),
    subjectCompletion: computeSubjectCompletion(tasks, today, currentCycle),
    progressFrom: currentCycle.start,
    progressTo: currentCycle.end,
    topicQuestionTotals: topicQuestionTotalsRecord,
    curriculumCourseIds,
    sessions,
    notes,
    notesHasMore: notes.length === STUDENT_NOTES_PAGE_SIZE,
    paragrafEntries,
    lgsRoutines: (lgsRoutineRows ?? []) as LgsDailyRoutine[],
    examType,
    generalExams: examTasks.filter((t) => t.task_type === "general_exam"),
    branchExams: examTasks.filter((t) => t.task_type === "branch_exam"),
    examMistakes: mistakeRows ?? [],
    weekDays,
    weekTasks: (weekTaskRows ?? []) as DetailTask[],
    fixedTasks: (fixedTaskRows ?? []) as StudentFixedTask[],
    allTimeTrackedMinutes,
    // Only LGS tasks need a Kanıt Fotoğrafı (lib/lgs-completion.ts).
    missingTasks: findMissingTasks(withNoResources(missingWindowRows), today, { requiresPhoto: usesPhotoWorkflow({ examType, maarifGrade }) }),
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
      <AytTrackProvider value={aytTrackOf((detail?.profile as { academic_track?: string | null } | undefined)?.academic_track)}>
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
                  topicQuestionTotals={detail.topicQuestionTotals}
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
                  studentName={detail.profile.full_name ?? null}
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
                {/* Fotoğraf Havuzu: every Kanıt Fotoğrafı of this student, sortable into the coach's folders (own page). */}
                <Link
                  href={`/coach/students/${id}/photos`}
                  className="bg-card hover:bg-muted mt-4 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-xs transition-colors"
                >
                  <Images className="size-4" />
                  Fotoğraf Havuzu
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
      </AytTrackProvider>
    </MaarifGradeProvider>
  );
}
