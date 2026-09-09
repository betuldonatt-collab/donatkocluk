"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";

import { TASK_TYPE_LABELS, type StudentTask } from "./types";

function formatTaskDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
  });
}

// Prominent, hard-to-miss banner listing every exam whose topic analysis
// was deferred ("Analizi Sonra Yap") — regardless of which day it was
// logged on, since a deferred analysis doesn't disappear once "today"
// moves on.
export function PendingAnalysisAlert({
  tasks,
  onOpenTask,
}: {
  tasks: StudentTask[];
  onOpenTask: (task: StudentTask) => void;
}) {
  const pending = tasks.filter((t) => t.analysis_pending);
  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <p className="text-sm font-semibold text-amber-700">
          {pending.length} bekleyen analiziniz var
        </p>
      </div>
      <div className="space-y-1.5">
        {pending.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onOpenTask(task)}
            className="flex w-full items-center justify-between gap-2 rounded-md bg-white/50 px-3 py-2 text-left text-sm transition-colors hover:bg-white/80 dark:bg-black/10 dark:hover:bg-black/20"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">
              {task.title}
              <span className="text-muted-foreground ml-1.5 font-normal">
                — {TASK_TYPE_LABELS[task.task_type]} · {formatTaskDate(task.task_date)}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
