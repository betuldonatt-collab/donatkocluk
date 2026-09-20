"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CourseTabs } from "@/components/course-tabs";
import type { ExamType } from "@/lib/exam-type";
import { PIPELINE_CONFIG, type PipelineMap, type PipelineStepKey } from "@/lib/topic-pipeline";
import {
  addBranchExamResource,
  addStudentResource,
  archiveStudentResource,
  setStudentTopicPipelineStep,
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
  {
    resources: ResourceRef[];
    branchExamResources: BranchExamResourceRef[];
    progress: ResourceProgressMap;
    topicStats: CourseTopicStats;
    // Per-topic pipeline ticks (the student's cohort steps), topicId -> checkboxes.
    pipeline?: PipelineMap;
  }
>;

const EMPTY_COURSE_DATA = {
  resources: [],
  branchExamResources: [],
  progress: {},
  topicStats: { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } },
};

// Fully interactive for the coach -- can add resources and toggle
// progress checkboxes on the student's behalf (RLS scopes every write to
// students on this coach's roster; see migration 0014).
export function KaynakTakibiTab({
  studentId,
  courseData,
  today,
  initialWeekStats,
  examType = "YKS",
}: {
  studentId: string;
  courseData: CourseResourceData;
  today: string;
  initialWeekStats: DayStat[];
  examType?: ExamType;
}) {
  const [data, setData] = useState<CourseResourceData>(courseData);
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

  function handleTogglePipeline(courseId: string, topicId: string, step: PipelineStepKey) {
    const nextValue = !((data[courseId]?.pipeline ?? {})[topicId]?.[step] ?? false);

    const apply = (value: boolean) =>
      setData((prev) => {
        const c = prev[courseId] ?? EMPTY_COURSE_DATA;
        const pipeline = c.pipeline ?? {};
        const state = pipeline[topicId] ?? {};
        return { ...prev, [courseId]: { ...c, pipeline: { ...pipeline, [topicId]: { ...state, [step]: value } } } };
      });

    apply(nextValue);
    const rollback = (message: string) => {
      apply(!nextValue);
      toast.error(message);
    };
    setStudentTopicPipelineStep(studentId, { courseId, topicId, step, value: nextValue })
      .then((res) => {
        if (!res.ok) rollback(res.error);
      })
      .catch(() => rollback("Adım kaydedilemedi, geri alındı."));
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

  return (
    <div className="space-y-4">
      <DailyStatsSummary studentId={studentId} today={today} initialWeekStats={initialWeekStats} />

      <CourseTabs
        examType={examType}
        render={(course) => {
          const courseId = course.id;
          const courseData = getData(courseId);
          return (
            <>
              <EditableCourseTable
                course={course}
                resources={courseData.resources}
                progress={courseData.progress}
                topicStats={courseData.topicStats}
                onAddResource={(name) => handleAddResource(courseId, name)}
                onToggle={(topicId, resourceId, field) => handleToggle(courseId, topicId, resourceId, field)}
                onArchiveResource={(resourceId) => handleArchiveResource(courseId, resourceId)}
                onReactivateResource={(resourceId) => handleReactivateResource(courseId, resourceId)}
                onDeleteResource={(resourceId) => handleDeleteResource(courseId, resourceId)}
                pipeline={{
                  config: PIPELINE_CONFIG[examType],
                  map: courseData.pipeline ?? {},
                  onToggle: (topicId, step) => handleTogglePipeline(courseId, topicId, step),
                }}
              />
              <BranchExamStockTable
                resources={courseData.branchExamResources}
                onAdd={(name, totalStock, remainingStock) => handleAddBranchExamResource(courseId, name, totalStock, remainingStock)}
                onUpdateStock={(resourceId, newTotalStock) => handleUpdateBranchExamStock(courseId, resourceId, newTotalStock)}
                onArchive={(resourceId) => handleArchiveBranchExamResource(courseId, resourceId)}
                onReactivate={(resourceId) => handleReactivateBranchExamResource(courseId, resourceId)}
                onDelete={(resourceId) => handleDeleteBranchExamResource(courseId, resourceId)}
              />
            </>
          );
        }}
      />
    </div>
  );
}
