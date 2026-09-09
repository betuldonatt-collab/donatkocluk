"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BranchExamStockTable, type BranchExamResourceRef } from "./_components/branch-exam-stock-table";
import { CourseTable, type CourseTopicStats, type ProgressMap, type Resource } from "./_components/course-table";
import { TotalsSummary, type ResourceTotals } from "./_components/totals-summary";
import {
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import {
  addOwnBranchExamResource,
  addResource as addResourceAction,
  toggleResourceProgress,
  updateOwnBranchExamStock,
} from "./actions";

export type CourseData = {
  resources: Resource[];
  branchExamResources: BranchExamResourceRef[];
  progress: ProgressMap;
  topicStats: CourseTopicStats;
};

const EMPTY_TOPIC_STATS: CourseTopicStats = { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } };
const EMPTY_COURSE_DATA: CourseData = { resources: [], branchExamResources: [], progress: {}, topicStats: EMPTY_TOPIC_STATS };

export function KaynakTakibiClient({
  initialCourseData,
  totals,
}: {
  initialCourseData: Record<string, CourseData>;
  totals: ResourceTotals;
}) {
  const [courseData, setCourseData] = useState<Record<string, CourseData>>(initialCourseData);
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function getData(courseId: string): CourseData {
    return courseData[courseId] ?? EMPTY_COURSE_DATA;
  }

  async function addResource(courseId: string, name: string) {
    try {
      const resource = await addResourceAction(courseId, name);
      setCourseData((prev) => {
        const current = prev[courseId] ?? EMPTY_COURSE_DATA;
        return {
          ...prev,
          [courseId]: { ...current, resources: [...current.resources, resource] },
        };
      });
      toast.success("Kaynak eklendi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaynak eklenemedi, tekrar dene.");
      throw e;
    }
  }

  function toggleProgress(
    courseId: string,
    topicId: string,
    resourceId: string,
    field: "solved" | "reviewed",
  ) {
    const current = courseData[courseId] ?? EMPTY_COURSE_DATA;
    const key = `${topicId}::${resourceId}`;
    const state = current.progress[key] ?? { solved: false, reviewed: false };
    const nextState = { ...state, [field]: !state[field] };

    setCourseData((prev) => {
      const c = prev[courseId] ?? EMPTY_COURSE_DATA;
      return {
        ...prev,
        [courseId]: { ...c, progress: { ...c.progress, [key]: nextState } },
      };
    });

    toggleResourceProgress({
      courseId,
      topicId,
      resourceId,
      solved: nextState.solved,
      reviewed: nextState.reviewed,
    }).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Güncellenemedi, tekrar dene.");
      // Roll back the optimistic flip so the UI matches what's actually saved.
      setCourseData((prev) => {
        const c = prev[courseId] ?? EMPTY_COURSE_DATA;
        return { ...prev, [courseId]: { ...c, progress: { ...c.progress, [key]: state } } };
      });
    });
  }

  async function addBranchExamResource(courseId: string, name: string, totalStock: number, remainingStock: number) {
    try {
      const resource = await addOwnBranchExamResource(courseId, name, totalStock, remainingStock);
      setCourseData((prev) => {
        const current = prev[courseId] ?? EMPTY_COURSE_DATA;
        return { ...prev, [courseId]: { ...current, branchExamResources: [...current.branchExamResources, resource] } };
      });
      toast.success("Branş denemesi eklendi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eklenemedi, tekrar dene.");
      throw e;
    }
  }

  function updateBranchExamStock(courseId: string, resourceId: string, totalStock: number, remainingStock: number) {
    const previous = (courseData[courseId] ?? EMPTY_COURSE_DATA).branchExamResources.find((r) => r.id === resourceId);

    setCourseData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return {
        ...prev,
        [courseId]: {
          ...current,
          branchExamResources: current.branchExamResources.map((r) =>
            r.id === resourceId ? { ...r, total_stock: totalStock, remaining_stock: remainingStock } : r,
          ),
        },
      };
    });

    updateOwnBranchExamStock(resourceId, totalStock, remainingStock).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Stok güncellenemedi, tekrar dene.");
      if (!previous) return;
      setCourseData((prev) => {
        const current = prev[courseId] ?? EMPTY_COURSE_DATA;
        return {
          ...prev,
          [courseId]: {
            ...current,
            branchExamResources: current.branchExamResources.map((r) => (r.id === resourceId ? previous : r)),
          },
        };
      });
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

      <div className="mb-4">
        <TotalsSummary totals={totals} />
      </div>

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
            addBranchExamResource={addBranchExamResource}
            updateBranchExamStock={updateBranchExamStock}
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
            addBranchExamResource={addBranchExamResource}
            updateBranchExamStock={updateBranchExamStock}
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
  addBranchExamResource,
  updateBranchExamStock,
}: {
  courses: Course[];
  selectedId: string;
  getData: (courseId: string) => CourseData;
  addResource: (courseId: string, name: string) => Promise<void>;
  toggleProgress: (
    courseId: string,
    topic: string,
    resourceId: string,
    field: "solved" | "reviewed",
  ) => void;
  addBranchExamResource: (courseId: string, name: string, totalStock: number, remainingStock: number) => Promise<void>;
  updateBranchExamStock: (courseId: string, resourceId: string, totalStock: number, remainingStock: number) => void;
}) {
  const course = courses.find((c) => c.id === selectedId) ?? courses[0];
  const data = getData(course.id);

  return (
    <>
      <CourseTable
        course={course}
        resources={data.resources}
        progress={data.progress}
        topicStats={data.topicStats}
        onAddResource={(name) => addResource(course.id, name)}
        onToggle={(topic, resourceId, field) => toggleProgress(course.id, topic, resourceId, field)}
      />
      <BranchExamStockTable
        resources={data.branchExamResources}
        onAdd={(name, totalStock, remainingStock) => addBranchExamResource(course.id, name, totalStock, remainingStock)}
        onUpdateStock={(resourceId, totalStock, remainingStock) => updateBranchExamStock(course.id, resourceId, totalStock, remainingStock)}
      />
    </>
  );
}
