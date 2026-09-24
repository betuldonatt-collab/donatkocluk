"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { completionPercent } from "@/lib/completion";
import { weightedDayCounts, weightedWeekCompletionCounts, type WeightableTask } from "@/lib/effort-weight";
import { WeeklyProgressCard } from "@/components/weekly-progress-card";
import { mondayOf } from "@/lib/date";
import type { StudentTask } from "./types";

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Slim rows are enough: everything the effort weighting needs, nothing else.
export type ProgressTask = WeightableTask & { id: string };

// Dün / Bugün / Yarın as three separate bars: each is simply that
// calendar day's tasks -- done / assigned -- with no lock-day or week
// logic, so a student can focus on the immediate short term.
function DailyProgressCard({ tasks, today }: { tasks: ProgressTask[]; today: string }) {
  const days = [
    { key: "yesterday", label: "Dün", date: addDaysISO(today, -1) },
    { key: "today", label: "Bugün", date: today },
    { key: "tomorrow", label: "Yarın", date: addDaysISO(today, 1) },
  ] as const;

  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <p className="text-foreground mb-3 text-sm font-semibold">Günlük İlerleme</p>
      <div className="space-y-3.5">
        {days.map((d) => {
          const dayTasks = tasks.filter((t) => t.task_date === d.date);
          const done = dayTasks.filter((t) => t.status === "done").length;
          // Effort-weighted, not a task count: a heavy math set moves the
          // bar further than a short reading task (lib/effort-weight.ts).
          const pct = completionPercent(weightedDayCounts(dayTasks, d.date));
          const isToday = d.key === "today";
          const dateLabel = new Date(`${d.date}T00:00:00Z`).toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          });
          return (
            <div key={d.key} className={cn(d.key === "yesterday" && "opacity-75", d.key === "tomorrow" && "opacity-90")}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className={cn(isToday ? "text-foreground font-semibold" : "text-muted-foreground font-medium")}>
                  {d.label} <span className="text-muted-foreground text-xs font-normal">· {dateLabel}</span>
                </span>
                <span className={cn("tabular-nums", isToday ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {pct === null ? "—" : `%${pct}`}
                  {dayTasks.length > 0 && (
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      {done}/{dayTasks.length}
                    </span>
                  )}
                </span>
              </div>
              <div
                className={cn("h-2.5 overflow-hidden rounded-full", d.key === "tomorrow" ? "bg-muted/60 border-border border border-dashed" : "bg-muted")}
                role="progressbar"
                aria-valuenow={pct ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${d.label} ilerleme`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isToday ? "bg-primary" : d.key === "yesterday" ? "bg-muted-foreground/50" : "bg-primary/40",
                  )}
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              {pct === null && <p className="text-muted-foreground mt-1 text-xs">Görev yok</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// `liveTasks` is the board's own optimistically-updated current-week list;
// `extraTasks` is a static slim fetch covering last week and the next
// day, so Dün/Yarın and the "Geçen Hafta" bar work across week edges.
// Live rows win when both contain the same task.
export function ProgressOverview({
  liveTasks,
  extraTasks,
  today,
  lockedAt,
  previousLockedAt,
}: {
  liveTasks: StudentTask[];
  extraTasks: ProgressTask[];
  today: string;
  lockedAt: string | null;
  previousLockedAt: string | null;
}) {
  const all = useMemo(() => {
    const liveIds = new Set(liveTasks.map((t) => t.id));
    return [...liveTasks, ...extraTasks.filter((t) => !liveIds.has(t.id))] as ProgressTask[];
  }, [liveTasks, extraTasks]);

  const weekStart = mondayOf(today);
  const prevStart = addDaysISO(weekStart, -7);
  const current = { start: weekStart, end: addDaysISO(weekStart, 6), pct: completionPercent(weightedWeekCompletionCounts(all, today, lockedAt)) };
  const previous = { start: prevStart, end: addDaysISO(weekStart, -1), pct: completionPercent(weightedWeekCompletionCounts(all, prevStart, previousLockedAt)) };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border-border bg-card rounded-xl border p-4">
        <p className="text-foreground mb-3 text-sm font-semibold">Haftalık Program Tamamlama</p>
        <WeeklyProgressCard previous={previous} current={current} />
      </div>
      <DailyProgressCard tasks={all} today={today} />
    </div>
  );
}
