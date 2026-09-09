"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addStudentResource, assignRoutineToWeek, assignTaskToStudent, updateAssignedTask } from "../../../../actions";
import type { DetailTask } from "../../types";
import type { CourseResourceData } from "../kaynak-takibi-tab";
import { ALL_COURSES, TaskFormFields, defaultTaskFormValue, taskFormValueToPayload, valueFromTask, type TaskFormValue } from "./task-form-fields";
import { TrialResultsSection } from "./trial-results-section";

export type TaskDrawerState =
  | { mode: "create"; date: string }
  | { mode: "create-multi"; initialTab?: "task" | "routine"; initialDate?: string }
  | { mode: "edit"; task: DetailTask };

const DAY_LABELS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type RoutineType = "paragraf" | "problem" | "diger";

const ROUTINE_TYPE_OPTIONS: { value: RoutineType; label: string }[] = [
  { value: "paragraf", label: "Paragraf" },
  { value: "problem", label: "Problem" },
  { value: "diger", label: "Diğer" },
];

function firstNonRoutineCourseId(): string {
  return ALL_COURSES.find((c) => c.id !== "paragraf" && c.id !== "problem")?.id ?? ALL_COURSES[0].id;
}

// Monday=0..Sunday=6, matching DAY_LABELS_SHORT's own order -- JS's native
// getUTCDay() is Sunday=0..Saturday=6, so this just rotates it.
function mondayIndexOf(dateIso: string): number {
  const dow = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return (dow + 6) % 7;
}

function shortDayLabel(dateIso: string): string {
  return DAY_LABELS_SHORT[mondayIndexOf(dateIso)];
}

// Slide-over drawer -- not a blocking modal. Handles three cases: a
// single-day create (opened from a day column's bottom "+"), a multi-day
// create (opened from the board's general "Yeni Görev Ekle" button, or
// from a day column's Rutinler "+"), and edit. Multi-day create has two
// tabs: "Görev Ekle" (a normal task, any course) and "Rutin Ekle" (pick
// Paragraf / Problem / Diğer). Paragraf and Problem fix the course to
// their synthetic pseudo-course id -- that's what routes the resulting
// rows into each day column's Rutinler section instead of its main task
// list (see isRoutineCourseId). "Diğer" is just the normal form again,
// so its rows land in the main section like any other task.
//
// "Multi-day" here means picking any subset of the 7 days currently on
// screen (weekDays, as passed down from the schedule board's rolling
// window) -- deliberately no start/end date range picker. Assigning
// across a different window is just: page the board there with Prev/Next,
// then reopen this drawer for it.
//
// The parent must only mount this when a drawer state exists, keyed on
// that state's identity, so opening a different day/task always starts
// from a clean form instead of resuming whatever the last open left
// behind.
export function TaskDrawer({
  state,
  onClose,
  studentId,
  weekDays,
  courseResourceData,
  onCreated,
  onSaved,
  onResourceCreated,
}: {
  state: TaskDrawerState;
  onClose: () => void;
  studentId: string;
  weekDays: { date: string; label: string }[];
  courseResourceData: CourseResourceData;
  onCreated: (tasks: DetailTask[]) => void;
  onSaved: (task: DetailTask) => void;
  onResourceCreated: (courseId: string, kind: "study" | "branch_exam", resource: { id: string; name: string }) => void;
}) {
  const initialTab = state.mode === "create-multi" ? (state.initialTab ?? "task") : "task";
  const [tab, setTab] = useState<"task" | "routine">(initialTab);
  const [routineType, setRoutineType] = useState<RoutineType>("paragraf");
  const [value, setValue] = useState<TaskFormValue>(() => {
    if (state.mode === "edit") return valueFromTask(state.task, courseResourceData);
    if (initialTab === "routine") return { ...defaultTaskFormValue(), courseId: "paragraf" };
    return defaultTaskFormValue();
  });
  // Which of the CURRENTLY VISIBLE 7 days (weekDays, as passed down from
  // the schedule board's own rolling window) to create on -- indices into
  // that array, not a standalone date range. Deliberately scoped to
  // single-day creation and to this one on-screen window: no start/end
  // date pickers here, so a multi-week assignment isn't something this
  // drawer can express -- the coach pages Prev/Next on the board itself
  // and reopens this for the next window instead.
  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => {
    if (state.mode === "create-multi" && state.initialDate) {
      const idx = weekDays.findIndex((d) => d.date === state.initialDate);
      return new Set(idx === -1 ? [] : [idx]);
    }
    return new Set(weekDays.map((_, i) => i));
  });
  const taskDates = state.mode === "create-multi" ? weekDays.filter((_, i) => selectedDays.has(i)).map((d) => d.date) : [];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free-form drag, not a drop-target reorder -- @dnd-kit (already used
  // for the Kanban board) is built around droppable zones, not a good
  // fit here, so this is plain pointer-event tracking. Offset is
  // additive on top of the panel's default fixed position (see the
  // wrapper's className below), starting at {0,0} until first dragged.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = "task-drawer-title";

  // Initial focus on mount only -- not re-run on every state change, so
  // typing in the form doesn't keep yanking focus back to the first field.
  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const container = panelRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      const nextX = drag.originX + (e.clientX - drag.startX);
      const nextY = drag.originY + (e.clientY - drag.startY);
      // Keeps at least a corner of the panel reachable regardless of how
      // far it's dragged -- not pixel-exact against the panel's own
      // dimensions, just a generous "can't lose it off-screen" bound.
      setDragOffset({
        x: Math.min(Math.max(nextX, -window.innerWidth + 160), window.innerWidth - 160),
        y: Math.min(Math.max(nextY, -64), window.innerHeight - 120),
      });
    }
    function handlePointerUp() {
      dragStateRef.current = null;
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function handleHeaderPointerDown(e: React.PointerEvent) {
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, originX: dragOffset.x, originY: dragOffset.y };
  }

  function toggleDay(i: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleTabChange(next: "task" | "routine") {
    setTab(next);
    if (next === "routine") {
      setRoutineType("paragraf");
      setValue((v) => ({ ...v, courseId: "paragraf", topicId: "", resources: [] }));
    } else {
      setValue((v) => ({ ...v, courseId: firstNonRoutineCourseId(), topicId: "", resources: [] }));
    }
  }

  function handleRoutineTypeChange(next: RoutineType) {
    setRoutineType(next);
    if (next === "paragraf" || next === "problem") {
      setValue((v) => ({ ...v, courseId: next, topicId: "", resources: [] }));
    } else {
      setValue((v) => ({ ...v, courseId: firstNonRoutineCourseId(), topicId: "", resources: [] }));
    }
  }

  // Each resource row with a resourceName typed but no matching
  // resourceId is a not-yet-created resource -- create it in the
  // student's library first (if the coach left the auto-add checkbox on)
  // so the task can link to a real row. Declining just drops that row
  // rather than inventing a resource that doesn't exist. Order is
  // preserved -- it becomes each row's task_resources.order_index.
  async function resolveResourceIds(): Promise<string[]> {
    if (value.taskType !== "question_bank" && value.taskType !== "branch_exam" && value.taskType !== "topic_study") return [];
    const kind = value.taskType === "branch_exam" ? "branch_exam" : "study";
    const ids: string[] = [];
    for (const r of value.resources) {
      if (r.resourceId) {
        ids.push(r.resourceId);
        continue;
      }
      const name = r.resourceName.trim();
      if (!name || !r.addToLibrary) continue;
      const created = await addStudentResource(studentId, value.courseId, name, kind);
      onResourceCreated(value.courseId, kind, created);
      ids.push(created.id);
    }
    return ids;
  }

  async function handleSave() {
    setError(null);

    if (state.mode === "create-multi" && taskDates.length === 0) {
      setError("Lütfen en az bir gün seçin.");
      return;
    }

    setSaving(true);
    try {
      const resourceIds = await resolveResourceIds();
      const payload = { ...taskFormValueToPayload(value), resourceIds };

      if (state.mode === "create") {
        const created = await assignTaskToStudent({ studentId, taskDate: state.date, ...payload });
        onCreated(created as DetailTask[]);
      } else if (state.mode === "create-multi") {
        const created = await assignRoutineToWeek({ studentId, taskDates, ...payload });
        onCreated(created as DetailTask[]);
      } else {
        const updated = await updateAssignedTask(studentId, state.task.id, payload);
        onSaved(updated as DetailTask);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  const showRoutineForm = state.mode === "create-multi" && tab === "routine";
  const isRoutineCoursePicked = routineType === "paragraf" || routineType === "problem";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="border-border bg-card animate-in fade-in zoom-in-95 fixed top-20 right-6 z-50 flex max-h-[85vh] w-[420px] max-w-[calc(100vw-3rem)] flex-col rounded-lg border shadow-2xl duration-150 outline-none"
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
    >
      <div
        className="border-border flex cursor-move items-center justify-between rounded-t-lg border-b px-4 py-3 select-none"
        onPointerDown={handleHeaderPointerDown}
      >
        <h2 id={titleId} className="text-foreground text-base font-semibold">{state.mode === "edit" ? "Görevi Düzenle" : "Yeni Görev Ekle"}</h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Kapat">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {state.mode === "create-multi" && (
            <div className="bg-secondary inline-flex rounded-lg p-1">
              {(["task", "routine"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTabChange(t)}
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "task" ? "Görev Ekle" : "Rutin Ekle"}
                </button>
              ))}
            </div>
          )}

          {showRoutineForm && (
            <div className="space-y-1.5">
              <Label>Rutin Türü</Label>
              <div className="flex flex-wrap gap-1.5">
                {ROUTINE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleRoutineTypeChange(opt.value)}
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

          <TaskFormFields
            value={value}
            onChange={setValue}
            courseResourceData={courseResourceData}
            hideCourseTopic={showRoutineForm && isRoutineCoursePicked}
          />

          {state.mode === "edit" && (state.task.task_type === "branch_exam" || state.task.task_type === "general_exam") && (
            <TrialResultsSection studentId={studentId} task={state.task} onSaved={onSaved} />
          )}

          {state.mode === "create-multi" && (
            <div className="space-y-1.5">
              <Label>Günler</Label>
              <div className="flex flex-wrap gap-1.5">
                {weekDays.map((day, i) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      selectedDays.has(i)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {shortDayLabel(day.date)}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">{taskDates.length > 0 ? `${taskDates.length} gün seçildi.` : "Gün seçilmedi."}</p>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <div className="border-border flex justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving
              ? "Kaydediliyor..."
              : state.mode === "create-multi" && taskDates.length > 0
                ? `${taskDates.length} Gün İçin Kaydet`
                : "Kaydet"}
          </Button>
        </div>
    </div>
  );
}
