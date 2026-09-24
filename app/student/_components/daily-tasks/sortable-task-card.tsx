"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { TaskCard } from "./task-card";
import type { StudentTask } from "./types";

// Drag handle is a separate element with its own listeners, not the card
// itself -- the card's whole body is already a click target that opens
// the task modal, and @dnd-kit's pointer sensor would otherwise fight
// that click.
export function SortableTaskCard({
  task,
  onClick,
  trailing,
  showTimer = true,
  impactHint,
}: {
  task: StudentTask;
  impactHint?: { pct: number; text: string } | null;
  onClick: () => void;
  trailing?: React.ReactNode;
  // Süre Tut only makes sense looking at the real, current day -- see
  // TaskBoard's own canUseTimer. Defaults true so every OTHER caller
  // (week-task-cell.tsx's own card, if any) keeps its existing behavior
  // without having to pass this explicitly.
  showTimer?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: task.week_locked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        type="button"
        disabled={task.week_locked}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none rounded p-1.5 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Sürükleyerek sırala"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <TaskCard task={task} onClick={onClick} showTimer={showTimer} impactHint={impactHint} />
      </div>
      {trailing}
    </div>
  );
}
