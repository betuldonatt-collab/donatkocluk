"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CourseTable, type ProgressMap, type Resource } from "./_components/course-table";
import {
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_COURSES,
  type Course,
  type Track,
} from "./_data/courses";

type CourseData = { resources: Resource[]; progress: ProgressMap };

export default function KaynakTakibiPage() {
  const [courseData, setCourseData] = useState<Record<string, CourseData>>({});
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function getData(courseId: string): CourseData {
    return courseData[courseId] ?? { resources: [], progress: {} };
  }

  function addResource(courseId: string, name: string) {
    setCourseData((prev) => {
      const current = prev[courseId] ?? { resources: [], progress: {} };
      const resource: Resource = { id: crypto.randomUUID(), name };
      return {
        ...prev,
        [courseId]: { ...current, resources: [...current.resources, resource] },
      };
    });
  }

  function toggleProgress(
    courseId: string,
    topic: string,
    resourceId: string,
    field: "solved" | "reviewed",
  ) {
    setCourseData((prev) => {
      const current = prev[courseId] ?? { resources: [], progress: {} };
      const key = `${topic}::${resourceId}`;
      const state = current.progress[key] ?? { solved: false, reviewed: false };
      return {
        ...prev,
        [courseId]: {
          ...current,
          progress: { ...current.progress, [key]: { ...state, [field]: !state[field] } },
        },
      };
    });
  }

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

  const aytCourses = AYT_COURSES_BY_TRACK[track];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Kaynak Takibi</h1>
        <p className="text-muted-foreground text-sm">
          Konu bazlı değil, kaynak bazlı takip: her kaynak için soru çözümü ve
          yanlışlara dönüşü işaretle.
        </p>
      </header>

      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-4">
          <CourseChips
            courses={TYT_COURSES}
            selectedId={tytCourseId}
            onSelect={setTytCourseId}
          />
          <ActiveCourseTable
            courses={TYT_COURSES}
            selectedId={tytCourseId}
            getData={getData}
            addResource={addResource}
            toggleProgress={toggleProgress}
          />
        </TabsContent>

        <TabsContent value="ayt" className="space-y-4">
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

          <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          <ActiveCourseTable
            courses={aytCourses}
            selectedId={aytCourseId}
            getData={getData}
            addResource={addResource}
            toggleProgress={toggleProgress}
          />
        </TabsContent>
      </Tabs>
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
  getData,
  addResource,
  toggleProgress,
}: {
  courses: Course[];
  selectedId: string;
  getData: (courseId: string) => CourseData;
  addResource: (courseId: string, name: string) => void;
  toggleProgress: (
    courseId: string,
    topic: string,
    resourceId: string,
    field: "solved" | "reviewed",
  ) => void;
}) {
  const course = courses.find((c) => c.id === selectedId) ?? courses[0];
  const data = getData(course.id);

  return (
    <CourseTable
      course={course}
      resources={data.resources}
      progress={data.progress}
      onAddResource={(name) => addResource(course.id, name)}
      onToggle={(topic, resourceId, field) => toggleProgress(course.id, topic, resourceId, field)}
    />
  );
}
