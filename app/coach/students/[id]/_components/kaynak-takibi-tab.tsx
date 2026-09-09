"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import {
  addBranchExamResource,
  addStudentResource,
  archiveStudentResource,
  deleteStudentResource,
  reactivateStudentResource,
  toggleStudentResourceProgress,
  updateBranchExamStock,
} from "../../../actions";
import { BranchExamStockTable } from "./branch-exam-stock-table";
import { DailyStatsSummary, type DayStat } from "./daily-stats-summary";
import { EditableCourseTable } from "./editable-course-table";

export type ResourceRef = { id: string; name: string; is_active: boolean };
export type BranchExamResourceRef = { id: string; name: string; total_stock: number; remaining_stock: number; is_active: boolean };
export type ResourceProgressMap = Record<string, { solved: boolean; reviewed: boolean }>;
export type TopicStat = { total: number; correct: number; wrong: number; empty: number };
export type CourseTopicStats = { byTopic: Record<string, TopicStat>; karma: TopicStat };
export type CourseResourceData = Record<
  string,
  { resources: ResourceRef[]; branchExamResources: BranchExamResourceRef[]; progress: ResourceProgressMap; topicStats: CourseTopicStats }
>;

const EMPTY_COURSE_DATA = {
  resources: [],
  branchExamResources: [],
  progress: {},
  topicStats: { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } },
};

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

// Fully interactive for the coach -- can add resources and toggle
// progress checkboxes on the student's behalf (RLS scopes every write to
// students on this coach's roster; see migration 0014).
export function KaynakTakibiTab({
  studentId,
  courseData,
  today,
  initialWeekStats,
}: {
  studentId: string;
  courseData: CourseResourceData;
  today: string;
  initialWeekStats: DayStat[];
}) {
  const [data, setData] = useState<CourseResourceData>(courseData);
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

  function getData(courseId: string) {
    return data[courseId] ?? EMPTY_COURSE_DATA;
  }

  async function handleAddResource(courseId: string, name: string) {
    const resource = await addStudentResource(studentId, courseId, name);
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return { ...prev, [courseId]: { ...current, resources: [...current.resources, { ...resource, is_active: true }] } };
    });
  }

  async function handleAddBranchExamResource(courseId: string, name: string, totalStock: number, remainingStock: number) {
    const resource = await addBranchExamResource(studentId, courseId, name, totalStock, remainingStock);
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return { ...prev, [courseId]: { ...current, branchExamResources: [...current.branchExamResources, { ...resource, is_active: true }] } };
    });
  }

  async function handleUpdateBranchExamStock(courseId: string, resourceId: string, newTotalStock: number) {
    const updated = await updateBranchExamStock(studentId, resourceId, newTotalStock);
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return {
        ...prev,
        [courseId]: {
          ...current,
          branchExamResources: current.branchExamResources.map((r) => (r.id === resourceId ? { ...r, ...updated } : r)),
        },
      };
    });
  }

  function setBranchExamResourceActive(courseId: string, resourceId: string, isActive: boolean) {
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return {
        ...prev,
        [courseId]: {
          ...current,
          branchExamResources: current.branchExamResources.map((r) => (r.id === resourceId ? { ...r, is_active: isActive } : r)),
        },
      };
    });
  }

  async function handleArchiveBranchExamResource(courseId: string, resourceId: string) {
    setBranchExamResourceActive(courseId, resourceId, false);
    try {
      await archiveStudentResource(studentId, resourceId);
    } catch (e) {
      setBranchExamResourceActive(courseId, resourceId, true);
      toast.error(e instanceof Error ? e.message : "Kaynak arşivlenemedi, geri alındı.");
    }
  }

  async function handleReactivateBranchExamResource(courseId: string, resourceId: string) {
    setBranchExamResourceActive(courseId, resourceId, true);
    try {
      await reactivateStudentResource(studentId, resourceId);
    } catch (e) {
      setBranchExamResourceActive(courseId, resourceId, false);
      toast.error(e instanceof Error ? e.message : "Kaynak etkinleştirilemedi, geri alındı.");
    }
  }

  async function handleDeleteBranchExamResource(courseId: string, resourceId: string) {
    try {
      await deleteStudentResource(studentId, resourceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaynak silinemedi.");
      return;
    }
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return {
        ...prev,
        [courseId]: { ...current, branchExamResources: current.branchExamResources.filter((r) => r.id !== resourceId) },
      };
    });
  }

  function setResourceActive(courseId: string, resourceId: string, isActive: boolean) {
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      return {
        ...prev,
        [courseId]: {
          ...current,
          resources: current.resources.map((r) => (r.id === resourceId ? { ...r, is_active: isActive } : r)),
        },
      };
    });
  }

  async function handleArchiveResource(courseId: string, resourceId: string) {
    setResourceActive(courseId, resourceId, false);
    try {
      await archiveStudentResource(studentId, resourceId);
    } catch (e) {
      setResourceActive(courseId, resourceId, true);
      toast.error(e instanceof Error ? e.message : "Kaynak arşivlenemedi, geri alındı.");
    }
  }

  async function handleReactivateResource(courseId: string, resourceId: string) {
    setResourceActive(courseId, resourceId, true);
    try {
      await reactivateStudentResource(studentId, resourceId);
    } catch (e) {
      setResourceActive(courseId, resourceId, false);
      toast.error(e instanceof Error ? e.message : "Kaynak etkinleştirilemedi, geri alındı.");
    }
  }

  async function handleDeleteResource(courseId: string, resourceId: string) {
    try {
      await deleteStudentResource(studentId, resourceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaynak silinemedi.");
      return;
    }
    setData((prev) => {
      const current = prev[courseId] ?? EMPTY_COURSE_DATA;
      const progress = { ...current.progress };
      for (const key of Object.keys(progress)) {
        if (key.endsWith(`::${resourceId}`)) delete progress[key];
      }
      return {
        ...prev,
        [courseId]: { ...current, resources: current.resources.filter((r) => r.id !== resourceId), progress },
      };
    });
  }

  function handleToggle(courseId: string, topicId: string, resourceId: string, field: "solved" | "reviewed") {
    const current = data[courseId] ?? EMPTY_COURSE_DATA;
    const key = `${topicId}::${resourceId}`;
    const state = current.progress[key] ?? { solved: false, reviewed: false };
    const nextState = { ...state, [field]: !state[field] };
    const previousData = data;

    setData((prev) => {
      const c = prev[courseId] ?? EMPTY_COURSE_DATA;
      return { ...prev, [courseId]: { ...c, progress: { ...c.progress, [key]: nextState } } };
    });

    toggleStudentResourceProgress({
      studentId,
      courseId,
      topicId,
      resourceId,
      solved: nextState.solved,
      reviewed: nextState.reviewed,
    }).catch((e) => {
      setData(previousData);
      toast.error(e instanceof Error ? e.message : "İlerleme kaydedilemedi, geri alındı.");
    });
  }

  const aytCourses = AYT_COURSES_BY_TRACK[track];
  const tytCourse = TYT_COURSES.find((c) => c.id === tytCourseId) ?? TYT_COURSES[0];
  const aytCourse = aytCourses.find((c) => c.id === aytCourseId) ?? aytCourses[0];

  const tytData = getData(tytCourseId);
  const aytData = getData(aytCourseId);

  return (
    <div className="space-y-4">
      <DailyStatsSummary studentId={studentId} today={today} initialWeekStats={initialWeekStats} />

      <Tabs defaultValue="tyt">
      <TabsList>
        <TabsTrigger value="tyt">TYT</TabsTrigger>
        <TabsTrigger value="ayt">AYT</TabsTrigger>
      </TabsList>

      <TabsContent value="tyt" className="space-y-4 pt-4">
        <CourseChips courses={TYT_COURSES} selectedId={tytCourseId} onSelect={setTytCourseId} />
        <EditableCourseTable
          course={tytCourse}
          resources={tytData.resources}
          progress={tytData.progress}
          topicStats={tytData.topicStats}
          onAddResource={(name) => handleAddResource(tytCourseId, name)}
          onToggle={(topicId, resourceId, field) => handleToggle(tytCourseId, topicId, resourceId, field)}
          onArchiveResource={(resourceId) => handleArchiveResource(tytCourseId, resourceId)}
          onReactivateResource={(resourceId) => handleReactivateResource(tytCourseId, resourceId)}
          onDeleteResource={(resourceId) => handleDeleteResource(tytCourseId, resourceId)}
        />
        <BranchExamStockTable
          resources={tytData.branchExamResources}
          onAdd={(name, totalStock, remainingStock) => handleAddBranchExamResource(tytCourseId, name, totalStock, remainingStock)}
          onUpdateStock={(resourceId, newTotalStock) => handleUpdateBranchExamStock(tytCourseId, resourceId, newTotalStock)}
          onArchive={(resourceId) => handleArchiveBranchExamResource(tytCourseId, resourceId)}
          onReactivate={(resourceId) => handleReactivateBranchExamResource(tytCourseId, resourceId)}
          onDelete={(resourceId) => handleDeleteBranchExamResource(tytCourseId, resourceId)}
        />
      </TabsContent>

      <TabsContent value="ayt" className="space-y-4 pt-4">
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

        <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
        <EditableCourseTable
          course={aytCourse}
          resources={aytData.resources}
          progress={aytData.progress}
          topicStats={aytData.topicStats}
          onAddResource={(name) => handleAddResource(aytCourseId, name)}
          onToggle={(topicId, resourceId, field) => handleToggle(aytCourseId, topicId, resourceId, field)}
          onArchiveResource={(resourceId) => handleArchiveResource(aytCourseId, resourceId)}
          onReactivateResource={(resourceId) => handleReactivateResource(aytCourseId, resourceId)}
          onDeleteResource={(resourceId) => handleDeleteResource(aytCourseId, resourceId)}
        />
        <BranchExamStockTable
          resources={aytData.branchExamResources}
          onAdd={(name, totalStock, remainingStock) => handleAddBranchExamResource(aytCourseId, name, totalStock, remainingStock)}
          onUpdateStock={(resourceId, newTotalStock) => handleUpdateBranchExamStock(aytCourseId, resourceId, newTotalStock)}
          onArchive={(resourceId) => handleArchiveBranchExamResource(aytCourseId, resourceId)}
          onReactivate={(resourceId) => handleReactivateBranchExamResource(aytCourseId, resourceId)}
          onDelete={(resourceId) => handleDeleteBranchExamResource(aytCourseId, resourceId)}
        />
      </TabsContent>
      </Tabs>
    </div>
  );
}
