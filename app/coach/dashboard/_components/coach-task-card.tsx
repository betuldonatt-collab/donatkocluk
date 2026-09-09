"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, MessageCircle, Sparkles, Trash2, UserRound, X, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoachTask, CoachTaskStatus } from "../types";

const STATUS_BUTTONS: { status: CoachTaskStatus; label: string; icon: typeof Check }[] = [
  { status: "done", label: "Yapıldı", icon: Check },
  { status: "not_done", label: "Yapılmadı", icon: X },
  { status: "message_sent", label: "Mesaj Atıldı", icon: MessageCircle },
];

export function CoachTaskCard({
  task,
  studentName,
  onStatusChange,
  onDelete,
}: {
  task: CoachTask;
  studentName?: string | null;
  onStatusChange: (taskId: string, status: CoachTaskStatus) => void;
  onDelete: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isPostponeLocked = task.postponed_count >= 2;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border p-1.5 text-xs",
        task.status === "done" && "border-emerald-500/40 bg-emerald-500/10",
        task.status === "not_done" && "border-rose-500/40 bg-rose-500/10",
        task.status === "message_sent" && "border-amber-500/40 bg-amber-500/10",
        task.status === "pending" && "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
          aria-label="Sürükleyerek taşı"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-foreground truncate font-medium">{task.title}</p>
            {task.source === "automation" && <Sparkles className="size-3 shrink-0 text-amber-500" aria-label="Otomatik" />}
            {isPostponeLocked && (
              <span title="Bu görev en fazla 2 kez ertelenebilir, taşıma sınırına ulaşıldı">
                <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Erteleme sınırına ulaşıldı" />
              </span>
            )}
          </div>
          {studentName && (
            <p className="text-muted-foreground flex items-center gap-1 truncate">
              <UserRound className="size-2.5 shrink-0" />
              {studentName}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-5 shrink-0"
          onClick={() => onDelete(task.id)}
          aria-label="Görevi sil"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      <div className="mt-1.5 flex gap-1">
        {STATUS_BUTTONS.map(({ status, label, icon: Icon }) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatusChange(task.id, status)}
            aria-label={label}
            title={label}
            className={cn(
              "flex flex-1 items-center justify-center rounded py-0.5 transition-colors",
              task.status === status
                ? status === "done"
                  ? "bg-emerald-500/20 text-emerald-600"
                  : status === "not_done"
                    ? "bg-rose-500/20 text-rose-600"
                    : "bg-amber-500/20 text-amber-600"
                : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            <Icon className="size-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
