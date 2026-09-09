"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import { computeNet } from "@/lib/scoring";
import { DualMetricChart } from "../../_components/charts/dual-metric-chart";
import { getMoreBransExams, getTaskTopicMistakes } from "../../actions";
import { EXAMS_PAGE_SIZE } from "../../constants";
import { TaskModal } from "../../_components/daily-tasks/task-modal";
import type { StudentTask } from "../../_components/daily-tasks/types";
import { ExamTopicTable } from "../_components/exam-topic-table";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

function CourseChips({
  courses,
  selectedId,
  onSelect,
}: {
  courses: Course[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            selectedId === c.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

export function BransAnalysisClient({
  initialExams,
  initialMistakes,
  initialHasMore,
}: {
  initialExams: StudentTask[];
  initialMistakes: MistakeRow[];
  initialHasMore: boolean;
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

  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  const [activeTask, setActiveTask] = useState<StudentTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOpenKey, setModalOpenKey] = useState(0);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

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
  const tytBranchCourses = [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES];
  const aytBranchCourses = [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[track], ...AYT_COURSES_BY_TRACK[track]];
  const tytCourse = tytBranchCourses.find((c) => c.id === tytCourseId) ?? tytBranchCourses[0];
  const aytCourse = aytBranchCourses.find((c) => c.id === aytCourseId) ?? aytBranchCourses[0];

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
        a: computeNet(e.correct_count ?? 0, e.wrong_count ?? 0),
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
      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-4">
          <CourseChips courses={tytBranchCourses} selectedId={tytCourseId} onSelect={setTytCourseId} />
          {courseSection(tytCourse)}
        </TabsContent>

        <TabsContent value="ayt" className="space-y-4">
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTrackChange(t)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  track === t
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          <CourseChips courses={aytBranchCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          {courseSection(aytCourse)}
        </TabsContent>
      </Tabs>

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
