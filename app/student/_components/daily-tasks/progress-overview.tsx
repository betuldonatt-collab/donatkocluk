"use client";

import { useMemo } from "react";

import { completionPercent, type CycleWindow } from "@/lib/completion";
import { weightedCycleCounts, type WeightableTask } from "@/lib/effort-weight";
import { DailyProgressCard } from "@/components/daily-progress-card";
import { WeeklyProgressCard } from "@/components/weekly-progress-card";
import type { StudentTask } from "./types";

// Slim rows are enough: everything the effort weighting needs, nothing else.
export type ProgressTask = WeightableTask & { id: string };

// `liveTasks` is the board's own optimistically-updated current-week list;
// `extraTasks` is a static slim fetch reaching back to whichever is earlier
// (the current cycle's start or the previous cycle's) plus the next day, so
// Dün/Yarın and the "Önceki Dönem" bar work regardless of week boundaries.
// Live rows win when both contain the same task.
export function ProgressOverview({
  liveTasks,
  extraTasks,
  today,
  currentCycle,
  previousCycle,
}: {
  liveTasks: StudentTask[];
  extraTasks: ProgressTask[];
  today: string;
  currentCycle: CycleWindow;
  previousCycle: CycleWindow;
}) {
  const all = useMemo(() => {
    const liveIds = new Set(liveTasks.map((t) => t.id));
    return [...liveTasks, ...extraTasks.filter((t) => !liveIds.has(t.id))] as ProgressTask[];
  }, [liveTasks, extraTasks]);

  const current = { ...currentCycle, pct: completionPercent(weightedCycleCounts(all, currentCycle)) };
  const previous = { ...previousCycle, pct: completionPercent(weightedCycleCounts(all, previousCycle)) };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border-border bg-card rounded-xl border p-4">
        <p className="text-foreground mb-3 text-sm font-semibold">Dönemlik Program Tamamlama</p>
        <WeeklyProgressCard previous={previous} current={current} />
      </div>
      <DailyProgressCard tasks={all} today={today} />
    </div>
  );
}
