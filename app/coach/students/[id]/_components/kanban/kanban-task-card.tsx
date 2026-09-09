"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Pencil, Trash2 } from "lucide-react";

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
}: {
  task: DetailTask;
  resourceNameById?: Map<string, string>;
  onEdit: (task: DetailTask) => void;
  onDuplicate: (task: DetailTask) => void;
  onDelete: (task: DetailTask) => void;
  onStatusChange: (task: DetailTask, status: AssignedTaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={cn("border-border rounded-md border p-2.5", cardBackgroundClass(task), statusClasses(task))}>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
          aria-label="Sürükleyerek taşı"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <TaskCardBody task={task} resourceNameById={resourceNameById} />
      </div>

      <TaskStatusButtons task={task} onStatusChange={onStatusChange} />

      <div className="mt-1.5 flex justify-end gap-0.5">
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
