"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isRoutineCourseId } from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";
import { TEMPLATE_DAY_LABELS_SHORT, type TemplateTask } from "@/lib/weekly-template";
import {
  TaskFormFields,
  defaultTaskFormValue,
  firstCourseIdFor,
  taskFormValueToPayload,
  type TaskFormValue,
} from "../../students/[id]/_components/kanban/task-form-fields";
import { isCourseRoutine, routineOptionsFor, type RoutineType } from "../../students/[id]/_components/kanban/routine-options";

// One task/routine of a template plus the weekdays it repeats on. The fields are
// the coach's real assign-task form (TaskFormFields) and the drawer's "Rutin
// Türü" / "Günler" chips, so a template item is filled in exactly like a task
// assigned by hand -- minus the per-student Kaynak picker.

export type TemplateItemDraft = { days: number[]; task: TemplateTask };

type Tab = "task" | "routine";

function valueFromTemplateTask(task: TemplateTask, examType: ExamType): TaskFormValue {
  const base = defaultTaskFormValue(examType);
  return {
    ...base,
    taskType: task.taskType,
    courseId: task.taskType === "reading" ? "kitap-okuma" : (task.courseId ?? base.courseId),
    topicId: task.topicId ?? "",
    totalCount: task.totalCount?.toString() ?? "",
    durationMinutes: task.durationMinutes?.toString() ?? "",
    videoLinks: (task.videoLinks ?? []).map((v) => ({ url: v.url, title: v.title ?? "" })),
    generalExamTrack: task.generalExamTrack ?? base.generalExamTrack,
    generalExamPublisher: task.generalExamPublisher ?? "",
    branchExamPublisher: task.branchExamPublisher ?? "",
    bookTitle: task.bookTitle ?? "",
  };
}

function initialRoutineType(task: TemplateTask): RoutineType {
  if (task.taskType === "reading") return "kitap-okuma";
  if (task.courseId && isRoutineCourseId(task.courseId)) return task.courseId as RoutineType;
  return "diger";
}

function isRoutineTask(task: TemplateTask): boolean {
  return task.taskType === "reading" || (!!task.courseId && isRoutineCourseId(task.courseId));
}

// Same "leave reading behind when switching away" rule as the drawer's
// resetReadingType: a non-reading routine must not keep taskType "reading".
function leaveReading(taskType: TaskFormValue["taskType"]): TaskFormValue["taskType"] {
  return taskType === "reading" ? "question_bank" : taskType;
}

export function TemplateItemForm({
  initial,
  examType,
  onCancel,
  onSubmit,
}: {
  initial: TemplateItemDraft | null;
  examType: ExamType;
  onCancel: () => void;
  onSubmit: (item: TemplateItemDraft) => void;
}) {
  const [tab, setTab] = useState<Tab>(initial && isRoutineTask(initial.task) ? "routine" : "task");
  const [routineType, setRoutineType] = useState<RoutineType>(initial ? initialRoutineType(initial.task) : "paragraf");
  const [value, setValue] = useState<TaskFormValue>(() => {
    if (initial) return valueFromTemplateTask(initial.task, examType);
    return defaultTaskFormValue(examType);
  });
  const [days, setDays] = useState<Set<number>>(new Set(initial?.days ?? [0, 1, 2, 3, 4]));
  const [error, setError] = useState<string | null>(null);

  const routineOptions = routineOptionsFor(examType);
  const hideCourseTopic = tab === "routine" && isCourseRoutine(routineType);

  function changeTab(next: Tab) {
    setTab(next);
    if (next === "routine") {
      const first = routineOptions[0].value;
      setRoutineType(first);
      changeRoutine(first);
    } else {
      setValue((v) => ({ ...v, courseId: firstCourseIdFor(examType), topicId: "", taskType: leaveReading(v.taskType) }));
    }
  }

  function changeRoutine(next: RoutineType) {
    setRoutineType(next);
    if (next === "kitap-okuma") {
      setValue((v) => ({ ...v, courseId: next, topicId: "", taskType: "reading" }));
    } else if (isCourseRoutine(next)) {
      setValue((v) => ({ ...v, courseId: next, topicId: "", taskType: leaveReading(v.taskType) }));
    } else {
      setValue((v) => ({ ...v, courseId: firstCourseIdFor(examType), topicId: "", taskType: leaveReading(v.taskType) }));
    }
  }

  function toggleDay(i: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function setDayPreset(list: number[]) {
    setDays(new Set(list));
  }

  function submit() {
    if (days.size === 0) {
      setError("En az bir gün seç.");
      return;
    }
    const payload = taskFormValueToPayload(value);
    if (payload.taskType === "reading" && !payload.bookTitle && !payload.totalCount) {
      // A reading item with neither a book nor a page count says nothing.
      setError("Kitap adı veya sayfa sayısı gir.");
      return;
    }
    setError(null);
    onSubmit({ days: [...days].sort((a, b) => a - b), task: payload as TemplateTask });
  }

  return (
    <div className="space-y-4">
      <div className="bg-secondary inline-flex rounded-lg p-1">
        {(["task", "routine"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changeTab(t)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "task" ? "Görev Ekle" : "Rutin Ekle"}
          </button>
        ))}
      </div>

      {tab === "routine" && (
        <div className="space-y-1.5">
          <Label>Rutin Türü</Label>
          <div className="flex flex-wrap gap-1.5">
            {routineOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => changeRoutine(opt.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  routineType === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <TaskFormFields value={value} onChange={setValue} hideCourseTopic={hideCourseTopic} examType={examType} />

      <div className="space-y-1.5">
        <Label>Günler</Label>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_DAY_LABELS_SHORT.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleDay(i)}
              aria-pressed={days.has(i)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                days.has(i)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDayPreset([0, 1, 2, 3, 4, 5, 6])}>
            Her gün
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDayPreset([0, 1, 2, 3, 4])}>
            Hafta içi
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDayPreset([5, 6])}>
            Hafta sonu
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="button" onClick={submit}>
          {initial ? "Güncelle" : "Şablona Ekle"}
        </Button>
      </div>
    </div>
  );
}
