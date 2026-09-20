"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CourseTabs } from "@/components/course-tabs";
import { BranchExamStockTable, type BranchExamResourceRef } from "./_components/branch-exam-stock-table";
import { CourseTable, type CourseTopicStats, type ProgressMap, type Resource } from "./_components/course-table";
import { TotalsSummary, type ResourceTotals } from "./_components/totals-summary";
import type { Course } from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";
import {
  addOwnBranchExamResource,
  addResource as addResourceAction,
  setTopicPipelineStep,
  toggleResourceProgress,
  updateOwnBranchExamStock,
} from "./actions";
import { PIPELINE_CONFIG, type PipelineConfig, type PipelineMap, type PipelineStepKey } from "@/lib/topic-pipeline";

export type CourseData = {
  resources: Resource[];
  branchExamResources: BranchExamResourceRef[];
  progress: ProgressMap;
  // Per-topic pipeline ticks (the cohort's own steps), topicId -> checkboxes.
  pipeline: PipelineMap;
  topicStats: CourseTopicStats;
};

const EMPTY_TOPIC_STATS: CourseTopicStats = { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } };
const EMPTY_COURSE_DATA: CourseData = { resources: [], branchExamResources: [], progress: {}, pipeline: {}, topicStats: EMPTY_TOPIC_STATS };

export function KaynakTakibiClient({
  initialCourseData,
  totals,
  examType,
}: {
  initialCourseData: Record<string, CourseData>;
  totals: ResourceTotals;
  examType: ExamType;
}) {
  const [courseData, setCourseData] = useState<Record<string, CourseData>>(initialCourseData);

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

  function togglePipeline(courseId: string, topicId: string, step: PipelineStepKey) {
    const nextValue = !((courseData[courseId] ?? EMPTY_COURSE_DATA).pipeline[topicId]?.[step] ?? false);

    const apply = (value: boolean) =>
      setCourseData((prev) => {
        const c = prev[courseId] ?? EMPTY_COURSE_DATA;
        const state = c.pipeline[topicId] ?? {};
        return { ...prev, [courseId]: { ...c, pipeline: { ...c.pipeline, [topicId]: { ...state, [step]: value } } } };
      });

    apply(nextValue);
    const rollback = (message: string) => {
      toast.error(message);
      // Roll back the optimistic flip so the UI matches what's actually saved.
      apply(!nextValue);
    };
    setTopicPipelineStep({ courseId, topicId, step, value: nextValue })
      .then((res) => {
        if (!res.ok) rollback(res.error);
      })
      .catch(() => rollback("Güncellenemedi, tekrar dene."));
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

      <CourseTabs
        examType={examType}
        render={(course) => (
          <ActiveCourseTable
            course={course}
            getData={getData}
            addResource={addResource}
            toggleProgress={toggleProgress}
            pipelineConfig={PIPELINE_CONFIG[examType]}
            togglePipeline={togglePipeline}
            addBranchExamResource={addBranchExamResource}
            updateBranchExamStock={updateBranchExamStock}
          />
        )}
      />
    </div>
  );
}

function ActiveCourseTable({
  course,
  getData,
  addResource,
  toggleProgress,
  pipelineConfig,
  togglePipeline,
  addBranchExamResource,
  updateBranchExamStock,
}: {
  course: Course;
  getData: (courseId: string) => CourseData;
  addResource: (courseId: string, name: string) => Promise<void>;
  toggleProgress: (
    courseId: string,
    topic: string,
    resourceId: string,
    field: "solved" | "reviewed",
  ) => void;
  pipelineConfig: PipelineConfig;
  togglePipeline: (courseId: string, topicId: string, step: PipelineStepKey) => void;
  addBranchExamResource: (courseId: string, name: string, totalStock: number, remainingStock: number) => Promise<void>;
  updateBranchExamStock: (courseId: string, resourceId: string, totalStock: number, remainingStock: number) => void;
}) {
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
        pipeline={{
          config: pipelineConfig,
          map: data.pipeline,
          onToggle: (topicId, step) => togglePipeline(course.id, topicId, step),
        }}
      />
      <BranchExamStockTable
        resources={data.branchExamResources}
        onAdd={(name, totalStock, remainingStock) => addBranchExamResource(course.id, name, totalStock, remainingStock)}
        onUpdateStock={(resourceId, totalStock, remainingStock) => updateBranchExamStock(course.id, resourceId, totalStock, remainingStock)}
      />
    </>
  );
}
