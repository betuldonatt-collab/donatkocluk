"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createCoachTask, deleteCoachTask, moveCoachTask, updateCoachTaskOrder, updateCoachTaskStatus } from "../../actions";
import type { CoachTask, CoachTaskStatus, RosterStudent } from "../types";
import { CoachTaskCard } from "./coach-task-card";

const DAY_PREFIX = "day:";
const MAX_TASK_POSTPONEMENTS = 2;

export function DailyChecklist({
  weekDays,
  today,
  tasks,
  roster,
  onTasksChange,
}: {
  weekDays: { date: string; label: string }[];
  today: string;
  tasks: CoachTask[];
  roster: RosterStudent[];
  onTasksChange: (updater: (prev: CoachTask[]) => CoachTask[]) => void;
}) {
  const [addOpenFor, setAddOpenFor] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function tasksByDay(date: string) {
    return tasks.filter((t) => t.task_date === date).sort((a, b) => a.order_index - b.order_index);
  }

  function containerOf(id: string): string | null {
    if (id.startsWith(DAY_PREFIX)) return id.slice(DAY_PREFIX.length);
    return tasks.find((t) => t.id === id)?.task_date ?? null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const sourceDay = containerOf(activeId);
    const targetDay = containerOf(overId);
    if (!sourceDay || !targetDay) return;

    if (sourceDay === targetDay) {
      const dayTasks = tasksByDay(sourceDay);
      const oldIndex = dayTasks.findIndex((t) => t.id === activeId);
      const newIndex = dayTasks.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const reordered = arrayMove(dayTasks, oldIndex, newIndex);
      const updates = reordered.map((t, i) => ({ id: t.id, order_index: i }));
      const orderById = new Map(updates.map((u) => [u.id, u.order_index]));
      onTasksChange((prev) => prev.map((t) => (orderById.has(t.id) ? { ...t, order_index: orderById.get(t.id)! } : t)));
      updateCoachTaskOrder(updates);
      return;
    }

    const movedTask = tasks.find((t) => t.id === activeId);
    if (!movedTask) return;
    if (movedTask.postponed_count >= MAX_TASK_POSTPONEMENTS) {
      toast.error("Bu görev en fazla 2 kez ertelenebilir.");
      return;
    }
    const targetTasks = tasksByDay(targetDay);
    let insertIndex = targetTasks.length;
    if (!overId.startsWith(DAY_PREFIX)) {
      const idx = targetTasks.findIndex((t) => t.id === overId);
      if (idx !== -1) insertIndex = idx;
    }
    const newTargetList = [...targetTasks];
    newTargetList.splice(insertIndex, 0, movedTask);
    const targetUpdates = newTargetList.map((t, i) => ({ id: t.id, order_index: i }));
    const orderById = new Map(targetUpdates.map((u) => [u.id, u.order_index]));

    onTasksChange((prev) =>
      prev.map((t) => {
        if (t.id === activeId) {
          return { ...t, task_date: targetDay, order_index: orderById.get(t.id)!, postponed_count: t.postponed_count + 1 };
        }
        if (orderById.has(t.id)) return { ...t, order_index: orderById.get(t.id)! };
        return t;
      }),
    );

    moveCoachTask(activeId, targetDay, orderById.get(activeId)!).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Görev taşınamadı, tekrar dene.");
      onTasksChange((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, task_date: sourceDay, postponed_count: movedTask.postponed_count } : t)),
      );
    });
    const remaining = targetUpdates.filter((u) => u.id !== activeId);
    if (remaining.length > 0) updateCoachTaskOrder(remaining);
  }

  async function handleStatusChange(taskId: string, status: CoachTaskStatus) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    onTasksChange((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));

    // Show the rollover duplicate immediately -- don't wait on the
    // network round trip to render it. A temp id placeholder is added
    // right away (only if one doesn't already exist for this task) and
    // swapped for the server's real row once the action resolves.
    const willRoll =
      (status === "not_done" || status === "message_sent") && !tasks.some((t) => t.rolled_over_from === taskId);
    const tempId = `optimistic-${taskId}`;
    if (willRoll) {
      const nextDate = addDaysISO(task.task_date, 1);
      onTasksChange((prev) => [
        ...prev,
        {
          id: tempId,
          coach_id: task.coach_id,
          student_id: task.student_id,
          task_date: nextDate,
          title: task.title,
          description: task.description,
          source: "automation",
          status: "pending",
          order_index: prev.filter((t) => t.task_date === nextDate).length,
          rolled_over_from: taskId,
          postponed_count: 0,
        },
      ]);
    }

    const { rolloverChild } = await updateCoachTaskStatus(taskId, status);

    if (willRoll) {
      onTasksChange((prev) => {
        const withoutTemp = prev.filter((t) => t.id !== tempId);
        return rolloverChild ? [...withoutTemp, rolloverChild as CoachTask] : withoutTemp;
      });
    } else if (rolloverChild) {
      onTasksChange((prev) =>
        prev.some((t) => t.id === rolloverChild.id) ? prev : [...prev, rolloverChild as CoachTask],
      );
    }
  }

  function handleDelete(taskId: string) {
    onTasksChange((prev) => prev.filter((t) => t.id !== taskId));
    deleteCoachTask(taskId);
  }

  function handleCreated(task: CoachTask) {
    onTasksChange((prev) => [...prev, task]);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {weekDays.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              isToday={day.date === today}
              tasks={tasksByDay(day.date)}
              roster={roster}
              onAddClick={() => setAddOpenFor(day.date)}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      <AddTaskDialog
        open={!!addOpenFor}
        date={addOpenFor}
        onOpenChange={(open) => !open && setAddOpenFor(null)}
        roster={roster}
        onCreated={handleCreated}
      />
    </DndContext>
  );
}

function DayColumn({
  day,
  isToday,
  tasks,
  roster,
  onAddClick,
  onStatusChange,
  onDelete,
}: {
  day: { date: string; label: string };
  isToday: boolean;
  tasks: CoachTask[];
  roster: RosterStudent[];
  onAddClick: () => void;
  onStatusChange: (taskId: string, status: CoachTaskStatus) => void;
  onDelete: (taskId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `${DAY_PREFIX}${day.date}` });

  return (
    <div
      className={cn(
        "flex min-h-[220px] flex-col gap-2 rounded-lg border p-2",
        isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card/40",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <h3 className={cn("truncate text-xs leading-tight font-semibold", isToday ? "text-primary" : "text-foreground")}>
          {day.label}
        </h3>
        <Button type="button" variant="ghost" size="icon" className="size-5 shrink-0" onClick={onAddClick} aria-label="Görev ekle">
          <Plus className="size-3.5" />
        </Button>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-[60px] flex-1 flex-col gap-1.5">
          {tasks.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-[10px]">—</p>
          ) : (
            tasks.map((task) => (
              <CoachTaskCard
                key={task.id}
                task={task}
                studentName={roster.find((s) => s.id === task.student_id)?.full_name}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function AddTaskDialog({
  open,
  date,
  onOpenChange,
  roster,
  onCreated,
}: {
  open: boolean;
  date: string | null;
  onOpenChange: (open: boolean) => void;
  roster: RosterStudent[];
  onCreated: (task: CoachTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!date || !title.trim()) return;
    setSaving(true);
    try {
      const task = await createCoachTask({ taskDate: date, title: title.trim(), studentId: studentId || null });
      onCreated(task as CoachTask);
      setTitle("");
      setStudentId("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Görev Ekle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Başlık</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Deneme sonuçlarını incele"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-student">İlgili Öğrenci (opsiyonel)</Label>
            <select
              id="task-student"
              className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">— Genel görev —</option>
              {roster.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name ?? "İsimsiz Öğrenci"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" onClick={handleCreate} disabled={!title.trim() || saving}>
            {saving ? "Ekleniyor..." : "Ekle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
