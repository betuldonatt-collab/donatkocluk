"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  LGS_COURSES,
  TRACK_LABELS,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
  type Track,
} from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  LGS_SUBJECT_GROUPS,
  TYT_SUBJECT_GROUPS,
  coursesForAytGroup,
  coursesForGroup,
  coursesForLgsGroup,
  inferAytTrackFromScores,
} from "@/lib/curriculum/subject-groups";
import { deleteAssignedTask, getTaskTopicMistakesForCoach } from "../../../actions";
import type { DetailTask } from "../types";
import { CoachExamTopicTable } from "./coach-exam-topic-table";
import { TaskDrawer, type TaskDrawerState } from "./kanban/task-drawer";
import type { CourseResourceData } from "./kaynak-takibi-tab";

type ExamMode = "brans" | "genel";
type MistakeRow = { task_id: string; course_id: string; topic_id: string };

// Mirrors buildGeneralExamTitle/parseGeneralExamTitle's own convention --
// duplicated per call site across this app, not imported.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" | "lgs" | "m9" {
  if (/^9.s*SINIF/i.test(title)) return "m9";
  if (/^LGS/i.test(title)) return "lgs";
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

function TrackToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="bg-secondary inline-flex rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === opt.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function selectClassName() {
  return "border-input bg-background flex h-10 md:h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
}

// Coach-panel counterpart to the student's Branş/Genel deneme analysis
// pages -- same TYT_SUBJECT_GROUPS-driven course grouping and the shared
// table design (CoachExamTopicTable), but reuses THIS tab's already-
// established TrackToggle/select chrome (see charts-tab.tsx) instead of
// the student's chip UI, and opens the coach's own TaskDrawer per exam
// (edit results, delete) instead of the student's TaskModal.
export function CoachExamAnalysisSection({
  studentId,
  branchExams: initialBranchExams,
  generalExams: initialGeneralExams,
  examMistakes,
  weekDays,
  courseResourceData: initialCourseResourceData,
  examType = "YKS",
}: {
  studentId: string;
  branchExams: DetailTask[];
  generalExams: DetailTask[];
  examMistakes: MistakeRow[];
  weekDays: { date: string; label: string }[];
  courseResourceData: CourseResourceData;
  examType?: ExamType;
}) {
  const isLgs = examType === "LGS";
  const [exams, setExams] = useState<DetailTask[]>([...initialBranchExams, ...initialGeneralExams]);
  const [mistakes, setMistakes] = useState(examMistakes);
  const [courseResourceData, setCourseResourceData] = useState(initialCourseResourceData);
  const [drawerState, setDrawerState] = useState<TaskDrawerState | null>(null);

  const [examMode, setExamMode] = useState<ExamMode>("brans");
  const [mainTrack, setMainTrack] = useState<"tyt" | "ayt">("tyt");
  const [aytSubTrack, setAytSubTrack] = useState<Track>("sayisal");
  const [branchCourseId, setBranchCourseId] = useState<string>(isLgs ? LGS_COURSES[0].id : TYT_COURSES[0].id);
  const [genelGroupKey, setGenelGroupKey] = useState<string>(
    isLgs ? LGS_SUBJECT_GROUPS[0].key : TYT_SUBJECT_GROUPS[0].key,
  );

  function handleMainTrackChange(next: "tyt" | "ayt") {
    setMainTrack(next);
    setBranchCourseId(next === "tyt" ? TYT_COURSES[0].id : AYT_COURSES_BY_TRACK.sayisal[0].id);
    setAytSubTrack("sayisal");
    setGenelGroupKey(next === "tyt" ? TYT_SUBJECT_GROUPS[0].key : AYT_SUBJECT_GROUPS_BY_TRACK.sayisal[0].key);
  }

  function handleAytSubTrackChange(next: Track) {
    setAytSubTrack(next);
    setBranchCourseId(AYT_COURSES_BY_TRACK[next][0].id);
    setGenelGroupKey(AYT_SUBJECT_GROUPS_BY_TRACK[next][0].key);
  }

  // Macro ("whole fruit") subjects lead the list, atomic ("sliced") ones
  // follow -- never replacing or nesting them, so the coach can
  // independently assign/review either "Fizik" or "TYT Fen" as a branch exam.
  // LGS has no TYT/AYT split or macro subjects: one flat course list and the
  // two real sessions (Sözel / Sayısal) as the Genel Deneme groups.
  const branchCourses = isLgs
    ? LGS_COURSES
    : mainTrack === "tyt"
      ? [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES]
      : [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[aytSubTrack], ...AYT_COURSES_BY_TRACK[aytSubTrack]];
  const genelGroups = isLgs
    ? LGS_SUBJECT_GROUPS
    : mainTrack === "tyt"
      ? TYT_SUBJECT_GROUPS
      : AYT_SUBJECT_GROUPS_BY_TRACK[aytSubTrack];
  const branchCourse = branchCourses.find((c) => c.id === branchCourseId) ?? branchCourses[0];
  const genelCoursesInGroup = isLgs
    ? coursesForLgsGroup(genelGroupKey)
    : mainTrack === "tyt" ? coursesForGroup(genelGroupKey as (typeof TYT_SUBJECT_GROUPS)[number]["key"]) : coursesForAytGroup(aytSubTrack, genelGroupKey);

  const mistakesByExam = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const m of mistakes) {
      if (!map[m.task_id]) map[m.task_id] = new Set();
      map[m.task_id].add(m.topic_id);
    }
    return map;
  }, [mistakes]);

  const currentBranchExams = exams
    .filter((e) => e.task_type === "branch_exam" && e.course_id === branchCourseId)
    .slice()
    .sort((a, b) => b.task_date.localeCompare(a.task_date));

  const currentGenelExams = exams
    .filter(
      (e) =>
        e.task_type === "general_exam" &&
        (isLgs
          ? parseGeneralExamTrack(e.title) === "lgs"
          : parseGeneralExamTrack(e.title) === mainTrack &&
            (mainTrack === "tyt" || inferAytTrackFromScores(e.subject_scores) === aytSubTrack)),
    )
    .slice()
    .sort((a, b) => b.task_date.localeCompare(a.task_date));

  function openExam(task: DetailTask) {
    setDrawerState({ mode: "edit", task });
  }

  function handleDelete(taskId: string) {
    const previousExams = exams;
    setExams((prev) => prev.filter((e) => e.id !== taskId));
    deleteAssignedTask(studentId, taskId).catch((e) => {
      setExams(previousExams);
      toast.error(e instanceof Error ? e.message : "Deneme silinemedi, geri getirildi.");
    });
  }

  async function handleSaved(updated: DetailTask) {
    setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    const result = await getTaskTopicMistakesForCoach(studentId, updated.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMistakes((prev) => [
      ...prev.filter((m) => m.task_id !== updated.id),
      ...result.mistakes.map((r) => ({ task_id: updated.id, course_id: r.course_id, topic_id: r.topic_id })),
    ]);
  }

  function handleResourceCreated(courseId: string, kind: "study" | "branch_exam", resource: { id: string; name: string }) {
    setCourseResourceData((prev) => {
      const current = prev[courseId] ?? {
        resources: [],
        branchExamResources: [],
        progress: {},
        topicStats: { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } },
      };
      return {
        ...prev,
        [courseId]:
          kind === "branch_exam"
            ? {
                ...current,
                branchExamResources: [...current.branchExamResources, { ...resource, total_stock: 0, remaining_stock: 0, is_active: true }],
              }
            : { ...current, resources: [...current.resources, { ...resource, is_active: true }] },
      };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TrackToggle
          options={[
            { value: "brans", label: "Branş Denemesi" },
            { value: "genel", label: "Genel Deneme" },
          ]}
          value={examMode}
          onChange={setExamMode}
        />
        {!isLgs && (
          <TrackToggle
            options={[
              { value: "tyt", label: "TYT" },
              { value: "ayt", label: "AYT" },
            ]}
            value={mainTrack}
            onChange={handleMainTrackChange}
          />
        )}
        {!isLgs && mainTrack === "ayt" && (
          <TrackToggle
            options={(Object.keys(TRACK_LABELS) as Track[]).map((t) => ({ value: t, label: TRACK_LABELS[t] }))}
            value={aytSubTrack}
            onChange={handleAytSubTrackChange}
          />
        )}

        {examMode === "brans" ? (
          <select
            className={cn(selectClassName(), "max-w-xs")}
            value={branchCourseId}
            onChange={(e) => setBranchCourseId(e.target.value)}
            aria-label="Branş dersi seç"
          >
            {branchCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            className={cn(selectClassName(), "max-w-xs")}
            value={genelGroupKey}
            onChange={(e) => setGenelGroupKey(e.target.value)}
            aria-label="Konu grubu seç"
          >
            {genelGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {examMode === "brans" && branchCourse ? (
        <CoachExamTopicTable
          course={branchCourse}
          exams={currentBranchExams}
          mistakesByExam={mistakesByExam}
          onOpenExam={openExam}
          onDelete={handleDelete}
        />
      ) : (
        examMode === "genel" &&
        genelCoursesInGroup.map((course) => (
          <CoachExamTopicTable
            key={course.id}
            course={course}
            exams={currentGenelExams}
            mistakesByExam={mistakesByExam}
            onOpenExam={openExam}
            onDelete={handleDelete}
          />
        ))
      )}

      {drawerState && (
        <TaskDrawer
          state={drawerState}
          onClose={() => setDrawerState(null)}
          studentId={studentId}
          weekDays={weekDays}
          courseResourceData={courseResourceData}
          onCreated={() => {}}
          onSaved={handleSaved}
          onResourceCreated={handleResourceCreated}
        />
      )}
    </div>
  );
}
