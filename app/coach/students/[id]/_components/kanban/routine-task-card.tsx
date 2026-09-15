"use client";

import { useState } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { AssignedTaskStatus } from "../../../../actions";
import type { DetailTask } from "../../types";
import {
  CARD_DENSITY_CONFIG,
  cardBackgroundClass,
  statusClasses,
  TaskCardBody,
  TaskCardHoverDetail,
  type CardDensity,
} from "./task-card-body";

const PAINT_FLASH_CLASS: Partial<Record<AssignedTaskStatus, string>> = {
  done: "bg-emerald-500/25",
  half_done: "bg-amber-500/25",
  not_done: "bg-rose-500/25",
};

// Static (no drag handle) card for the "Rutinler" lane -- routines live
// in their own dedicated container, separate from the day columns'
// drag-and-drop task shuffling, so this deliberately doesn't call
// useSortable the way KanbanTaskCard does.
export function RoutineTaskCard({
  task,
  resourceNameById,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  paintMode,
  density,
}: {
  task: DetailTask;
  resourceNameById?: Map<string, string>;
  onEdit: (task: DetailTask) => void;
  onDuplicate: (task: DetailTask) => void;
  onDelete: (task: DetailTask) => void;
  onStatusChange: (task: DetailTask, status: AssignedTaskStatus) => void;
  // Non-null while "Hızlı İşaretleme" (Paintbrush) mode is active -- see
  // KanbanTaskCard's own comment, same treatment here.
  paintMode: AssignedTaskStatus | null;
  density: CardDensity;
}) {
  const [flash, setFlash] = useState<AssignedTaskStatus | null>(null);

  function handlePaintClick() {
    if (!paintMode) return;
    onStatusChange(task, paintMode);
    setFlash(paintMode);
    window.setTimeout(() => setFlash(null), 500);
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          onClick={paintMode ? handlePaintClick : undefined}
          className={cn(
            "border-border flex flex-col rounded-md border p-2.5 transition-colors",
            CARD_DENSITY_CONFIG[density].heightClass,
            cardBackgroundClass(task),
            statusClasses(task),
            paintMode && "cursor-pointer ring-primary/50 hover:ring-2",
            flash && PAINT_FLASH_CLASS[flash],
          )}
        >
          <div className="flex items-start gap-1.5">
            <TaskCardBody task={task} resourceNameById={resourceNameById} density={density} />
          </div>

          <div className={cn("mt-auto flex justify-end gap-0.5 pt-1.5", paintMode && "pointer-events-none opacity-30")}>
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
      </HoverCardTrigger>
      <HoverCardContent>
        <TaskCardHoverDetail task={task} resourceNameById={resourceNameById} />
      </HoverCardContent>
    </HoverCard>
  );
}
