"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { cn } from "@/lib/utils";
import type { AssignedTaskStatus } from "../../../../actions";
import type { DetailTask } from "../../types";
import { EvidencePhotoButton } from "./evidence-photo-button";
import { cardBackgroundClass, statusClasses, TaskCardBody, TaskCardHoverDetail } from "./task-card-body";

const PAINT_FLASH_CLASS: Partial<Record<AssignedTaskStatus, string>> = {
  done: "bg-emerald-500/25",
  half_done: "bg-amber-500/25",
  not_done: "bg-rose-500/25",
};

export function KanbanTaskCard({
  task,
  studentId,
  resourceNameById,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onToggleLock,
  paintMode,
  cardHeight,
  onResize,
  onResizeEnd,
}: {
  task: DetailTask;
  // For loading the task's Kanıt Fotoğrafı (the camera icon).
  studentId: string;
  resourceNameById?: Map<string, string>;
  onEdit: (task: DetailTask) => void;
  onDuplicate: (task: DetailTask) => void;
  onDelete: (task: DetailTask) => void;
  onStatusChange: (task: DetailTask, status: AssignedTaskStatus) => void;
  onToggleLock: (task: DetailTask) => void;
  // Non-null while "Hızlı İşaretleme" (Paintbrush) mode is active on the
  // board -- see schedule-board.tsx. Turns the whole card into a one-click
  // "mark as this status" button instead of opening the edit drawer, and
  // mutes the grip handle + action-icon row so there's only one click
  // target on the card while it's active.
  paintMode: AssignedTaskStatus | null;
  // Current height in px for the ROW this card is in (its position in the
  // day's Görevler list -- see taskRows in schedule-board.tsx), and the
  // drag callbacks (see ResizeHandle). Every card and placeholder at that
  // same row index, across all 7 days, shares this value -- dragging this
  // card's handle only ever resizes its own row, leaving every other row
  // untouched, like dragging one row boundary in a spreadsheet.
  cardHeight: number;
  onResize: (deltaY: number) => void;
  onResizeEnd: () => void;
}) {
  const [flash, setFlash] = useState<AssignedTaskStatus | null>(null);

  // disabled makes dnd-kit treat attributes/listeners as inert -- the grip
  // handle below stays mounted either way, just stops doing anything, so a
  // locked card can't be picked up while everything else still drags
  // freely around it (its position in the day's sequence is otherwise
  // ordinary: nothing about persisting order changes for a locked card).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: task.is_locked || !!paintMode,
  });
  // minHeight, not height: the row's dragged/stored height is a FLOOR, not a hard
  // cap -- a card whose real content (a description especially, see
  // TaskCardBody) is taller than that floor grows past it instead of having that
  // content silently clipped. Every other card at this row index still starts
  // from the same floor, so short cards keep lining up; only one that actually
  // needs more room pushes its own column's later rows down.
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, minHeight: cardHeight };

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
          ref={setNodeRef}
          style={style}
          onClick={paintMode ? handlePaintClick : undefined}
          className={cn(
            "border-border relative flex flex-col rounded-md border p-2.5 transition-colors",
            cardBackgroundClass(task),
            statusClasses(task),
            paintMode && "cursor-pointer ring-primary/50 hover:ring-2",
            flash && PAINT_FLASH_CLASS[flash],
          )}
        >
          <div className="flex min-h-0 flex-1 items-start gap-1.5">
            <button
              type="button"
              className={cn(
                "mt-0.5 shrink-0 touch-none rounded p-0.5",
                task.is_locked
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing",
                paintMode && "pointer-events-none opacity-30",
              )}
              aria-label={task.is_locked ? "Kilitli -- taşınamaz" : "Sürükleyerek taşı"}
              {...attributes}
              {...listeners}
            >
              {task.is_locked ? <Lock className="size-3.5" /> : <GripVertical className="size-3.5" />}
            </button>
            <TaskCardBody task={task} resourceNameById={resourceNameById} />
          </div>

          <div className={cn("mt-auto flex shrink-0 justify-end gap-0.5 pt-1.5", paintMode && "pointer-events-none opacity-30")}>
            <EvidencePhotoButton studentId={studentId} task={task} />
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

          <ResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} label="Bu satırın yüksekliğini ayarla" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent>
        <TaskCardHoverDetail task={task} resourceNameById={resourceNameById} />
      </HoverCardContent>
    </HoverCard>
  );
}
