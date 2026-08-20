"use client";

import { useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import { togglePastQuestion } from "./actions";
import { PieChart } from "./_components/pie-chart";
import { PastQuestionsTable } from "./_components/past-questions-table";
import { PAST_QUESTION_YEARS, pastQuestionKey, type PastQuestionMap } from "./_lib/shared";

function topicIdsOf(course: Course) {
  return course.units.flatMap((u) => u.topics.map((t) => t.id));
}

function countSolved(course: Course, map: PastQuestionMap) {
  const topicIds = topicIdsOf(course);
  let solved = 0;
  for (const topicId of topicIds) {
    for (const year of PAST_QUESTION_YEARS) {
      if (map[pastQuestionKey(topicId, year)]) solved += 1;
    }
  }
  return { solved, total: topicIds.length * PAST_QUESTION_YEARS.length };
}

export function CikmisSorularClient({
  initialProgressByCourse,
}: {
  initialProgressByCourse: Record<string, PastQuestionMap>;
}) {
  const [progressByCourse, setProgressByCourse] = useState(initialProgressByCourse);
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

  function toggle(courseId: string, topicId: string, year: number) {
    const key = pastQuestionKey(topicId, year);
    const current = progressByCourse[courseId]?.[key] ?? false;
    const next = !current;

    setProgressByCourse((prev) => ({
      ...prev,
      [courseId]: { ...prev[courseId], [key]: next },
    }));

    void togglePastQuestion({ courseId, topicId, year, solved: next });
  }

  const aytCourses = AYT_COURSES_BY_TRACK[track];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Çıkmış Sorular</h1>
        <p className="text-muted-foreground text-sm">
          Yıllara göre çıkmış soruları konu konu işaretle, ilerlemeni özetten takip et.
        </p>
      </header>

      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-6">
          <SummaryRow courses={TYT_COURSES} progressByCourse={progressByCourse} />
          <CourseChips courses={TYT_COURSES} selectedId={tytCourseId} onSelect={setTytCourseId} />
          <ActiveCourseTable
            courses={TYT_COURSES}
            selectedId={tytCourseId}
            progressByCourse={progressByCourse}
            onToggle={toggle}
          />
        </TabsContent>

        <TabsContent value="ayt" className="space-y-6">
          <div className="inline-flex rounded-lg bg-secondary p-1">
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

          <SummaryRow courses={aytCourses} progressByCourse={progressByCourse} />
          <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          <ActiveCourseTable
            courses={aytCourses}
            selectedId={aytCourseId}
            progressByCourse={progressByCourse}
            onToggle={toggle}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryRow({
  courses,
  progressByCourse,
}: {
  courses: Course[];
  progressByCourse: Record<string, PastQuestionMap>;
}) {
  const perCourse = useMemo(
    () => courses.map((c) => ({ course: c, ...countSolved(c, progressByCourse[c.id] ?? {}) })),
    [courses, progressByCourse],
  );
  const overall = useMemo(
    () => ({
      solved: perCourse.reduce((n, c) => n + c.solved, 0),
      total: perCourse.reduce((n, c) => n + c.total, 0),
    }),
    [perCourse],
  );

  return (
    <div className="border-border bg-card flex flex-wrap items-start gap-6 rounded-lg border p-4">
      <PieChart label="Genel" solved={overall.solved} total={overall.total} emphasized />
      <div className="bg-border w-px self-stretch" />
      <div className="flex flex-1 flex-wrap gap-4">
        {perCourse.map(({ course, solved, total }) => (
          <PieChart key={course.id} label={course.name} solved={solved} total={total} />
        ))}
      </div>
    </div>
  );
}

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

function ActiveCourseTable({
  courses,
  selectedId,
  progressByCourse,
  onToggle,
}: {
  courses: Course[];
  selectedId: string;
  progressByCourse: Record<string, PastQuestionMap>;
  onToggle: (courseId: string, topicId: string, year: number) => void;
}) {
  const course = courses.find((c) => c.id === selectedId) ?? courses[0];
  const progress = progressByCourse[course.id] ?? {};

  return (
    <PastQuestionsTable
      course={course}
      progress={progress}
      onToggle={(topicId, year) => onToggle(course.id, topicId, year)}
    />
  );
}
