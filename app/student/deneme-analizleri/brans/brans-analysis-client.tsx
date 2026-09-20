"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Track } from "@/lib/curriculum";
import { CourseTabs } from "@/components/course-tabs";
import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
  isLgsCourseId,
  type Course,
} from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";
import { computeLgsNet, computeNet } from "@/lib/scoring";
import { DualMetricChart } from "../../_components/charts/dual-metric-chart";
import { getMoreBransExams, getTaskTopicMistakes } from "../../actions";
import { EXAMS_PAGE_SIZE } from "../../constants";
import { TaskModal } from "../../_components/daily-tasks/task-modal";
import type { StudentTask } from "../../_components/daily-tasks/types";
import { ExamTopicTable } from "../_components/exam-topic-table";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

export function BransAnalysisClient({
  initialExams,
  initialMistakes,
  initialHasMore,
  examType,
}: {
  initialExams: StudentTask[];
  initialMistakes: MistakeRow[];
  initialHasMore: boolean;
  examType: ExamType;
}) {
  const [exams, setExams] = useState(initialExams);
  const [mistakes, setMistakes] = useState(initialMistakes);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = await getMoreBransExams(exams.length);
      setExams((prev) => [...prev, ...(more.exams as StudentTask[])]);
      setMistakes((prev) => [...prev, ...more.mistakes]);
      setHasMore(more.exams.length === EXAMS_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  const [activeTask, setActiveTask] = useState<StudentTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOpenKey, setModalOpenKey] = useState(0);

  function openExam(task: StudentTask) {
    setActiveTask(task);
    setModalOpenKey((k) => k + 1);
    setModalOpen(true);
  }

  async function handleSaved(updated: StudentTask) {
    setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    const rows = await getTaskTopicMistakes(updated.id);
    setMistakes((prev) => [
      ...prev.filter((m) => m.task_id !== updated.id),
      ...rows.map((r) => ({ task_id: updated.id, course_id: r.course_id, topic_id: r.topic_id })),
    ]);
  }

  // Macro ("whole fruit") subjects lead the list, atomic ("sliced") ones
  // follow -- never replacing or nesting them, a coach/student can pick
  // either "Fizik" or "TYT Fen" as fully independent, side-by-side options.
  // (LGS has no macro subjects -- its branş denemeleri are per-course.)
  const tytBranchCourses = [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES];
  const aytBranchCoursesFor = (t: Track) => [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[t], ...AYT_COURSES_BY_TRACK[t]];

  const mistakesByExam = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const m of mistakes) {
      if (!map[m.task_id]) map[m.task_id] = new Set();
      map[m.task_id].add(m.topic_id);
    }
    return map;
  }, [mistakes]);

  function examsForCourse(course: Course): StudentTask[] {
    return exams
      .filter((e) => e.course_id === course.id)
      .sort((a, b) => a.task_date.localeCompare(b.task_date));
  }

  function courseSection(course: Course) {
    const courseExams = examsForCourse(course);
    const chartData = courseExams
      .filter((e) => e.correct_count !== null || e.wrong_count !== null)
      .map((e) => ({
        date: e.task_date,
        // LGS nets use 3 wrong : 1 right, YKS 4 : 1.
        a: isLgsCourseId(course.id)
          ? computeLgsNet(e.correct_count ?? 0, e.wrong_count ?? 0)
          : computeNet(e.correct_count ?? 0, e.wrong_count ?? 0),
        b: e.duration_minutes ?? 0,
      }));

    return (
      <div key={course.id} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{course.name} — Net ve Süre Gelişimi</CardTitle>
            <CardDescription>Branş denemesi net ve süre değişimi</CardDescription>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={chartData} labelA="Net" labelB="Süre" unitB=" dk" />
          </CardContent>
        </Card>

        <ExamTopicTable
          course={course}
          exams={courseExams.slice().reverse()}
          mistakesByExam={mistakesByExam}
          onOpenExam={openExam}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CourseTabs
        examType={examType}
        tytCourses={tytBranchCourses}
        aytCoursesFor={aytBranchCoursesFor}
        render={courseSection}
      />

      {hasMore && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
        </Button>
      )}

      <TaskModal
        task={activeTask}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={handleSaved}
        initialStep="analysis"
        openKey={modalOpenKey}
      />
    </div>
  );
}
