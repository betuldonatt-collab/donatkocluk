"use client";

import { useMemo } from "react";

import { completionPercent } from "@/lib/completion";
import { weightedClosedCycleCounts, weightedCompletionCounts, type WeightableTask } from "@/lib/effort-weight";
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
  cycleStart,
  previousCycle,
}: {
  liveTasks: StudentTask[];
  extraTasks: ProgressTask[];
  today: string;
  cycleStart: string | null;
  previousCycle: { start: string; end: string } | null;
}) {
  const all = useMemo(() => {
    const liveIds = new Set(liveTasks.map((t) => t.id));
    return [...liveTasks, ...extraTasks.filter((t) => !liveIds.has(t.id))] as ProgressTask[];
  }, [liveTasks, extraTasks]);

  const current = { start: cycleStart ?? today, end: today, pct: completionPercent(weightedCompletionCounts(all, today, cycleStart)) };
  const previous = previousCycle
    ? { start: previousCycle.start, end: previousCycle.end, pct: completionPercent(weightedClosedCycleCounts(all, previousCycle.start, previousCycle.end)) }
    : { start: today, end: today, pct: null };

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
