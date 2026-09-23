"use client";

import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { completionCounts, completionPercent, completionStart } from "@/lib/completion";
import type { StudentTask } from "./types";

// Same underlying calculation (lib/completion.ts: only tasks from the day the
// coach locked this week's schedule, or the week's Monday until it is locked,
// up to today) rendered with two different framings depending on which tab it
// sits under -- see TaskBoard, which mounts exactly one of these per view
// instead of one bar shared across both:
//   "today" -- under Bugün. Headed by today's own date + day name (e.g. "24
//     Eylül Perşembe"), since that tab is about today specifically even
//     though the number itself can span back further than today alone.
//   "week"  -- under Bu Hafta. Framed as the active week's own progress.
export function WeekProgressBar({
  tasks,
  today,
  lockedAt,
  variant,
}: {
  tasks: StudentTask[];
  today: string;
  lockedAt: string | null;
  variant: "today" | "week";
}) {
  const counts = completionCounts(tasks, today, lockedAt);
  const pct = completionPercent(counts);
  const complete = pct === 100;
  const since = new Date(`${completionStart(today, lockedAt)}T00:00:00Z`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const todayLabel = new Date(`${today}T00:00:00Z`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  });

  return (
    <div
      className={cn(
        "border-border rounded-xl border p-4 transition-colors",
        complete ? "border-emerald-500/40 bg-emerald-500/10" : "bg-card",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-semibold">
            {variant === "today" ? "Bugüne Kadarki İlerleme" : "Bu Haftaki İlerleme"}
          </p>
          {variant === "today" && <p className="text-muted-foreground text-xs">{todayLabel}</p>}
        </div>
        <p className={cn("text-lg font-bold tabular-nums", complete ? "text-emerald-600" : "text-foreground")}>
          {pct === null ? "—" : `%${pct}`}
        </p>
      </div>

      <div
        className="bg-muted h-3 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={variant === "today" ? "Bugüne kadarki ilerleme" : "Bu haftaki ilerleme"}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct === null ? "w-0" : complete ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-sky-500",
          )}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>

      <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
        {pct === null ? (
          "Bugüne kadar tamamlaman gereken görev yok."
        ) : complete ? (
          <>
            <Trophy className="size-3.5 shrink-0 text-emerald-600" />
            <span className="font-medium text-emerald-700">Harika! Bugüne kadarki tüm görevlerini tamamladın.</span>
          </>
        ) : (
          <>
            {counts.done}/{counts.total} görev tamam · {since} tarihinden bugüne kadar
          </>
        )}
      </p>
    </div>
  );
}
