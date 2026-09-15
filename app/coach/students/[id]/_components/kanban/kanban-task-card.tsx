"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AssignedTaskStatus } from "../../../../actions";
import type { DetailTask } from "../../types";
import { cardBackgroundClass, statusClasses, TaskCardBody, TaskStatusButtons } from "./task-card-body";

export function KanbanTaskCard({
  task,
  resourceNameById,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onToggleLock,
}: {
  task: DetailTask;
  resourceNameById?: Map<string, string>;
  onEdit: (task: DetailTask) => void;
  onDuplicate: (task: DetailTask) => void;
  onDelete: (task: DetailTask) => void;
  onStatusChange: (task: DetailTask, status: AssignedTaskStatus) => void;
  onToggleLock: (task: DetailTask) => void;
}) {
  // disabled makes dnd-kit treat attributes/listeners as inert -- the grip
  // handle below stays mounted either way, just stops doing anything, so a
  // locked card can't be picked up while everything else still drags
  // freely around it (its position in the day's sequence is otherwise
  // ordinary: nothing about persisting order changes for a locked card).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: task.is_locked });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={cn("border-border rounded-md border p-2.5", cardBackgroundClass(task), statusClasses(task))}>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className={cn(
            "mt-0.5 shrink-0 touch-none rounded p-0.5",
            task.is_locked
              ? "text-muted-foreground/50 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing",
          )}
          aria-label={task.is_locked ? "Kilitli -- taşınamaz" : "Sürükleyerek taşı"}
          {...attributes}
          {...listeners}
        >
          {task.is_locked ? <Lock className="size-3.5" /> : <GripVertical className="size-3.5" />}
        </button>
        <TaskCardBody task={task} resourceNameById={resourceNameById} />
      </div>

      <TaskStatusButtons task={task} onStatusChange={onStatusChange} />

      <div className="mt-1.5 flex justify-end gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={() => onToggleLock(task)}
          aria-label={task.is_locked ? "Kilidi Aç" : "Kilitle"}
          title={task.is_locked ? "Kilidi Aç" : "Kilitle"}
        >
          {task.is_locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-5" onClick={() => onDuplicate(task)} aria-label="Kopyala">
          <Copy className="size-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-5" onClick={() => onEdit(task)} aria-label="Düzenle">
          <Pencil className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-5"
          onClick={() => onDelete(task)}
          aria-label="Sil"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}
