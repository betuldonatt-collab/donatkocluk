"use client";

import { useMemo } from "react";

import { completionPercent } from "@/lib/completion";
import { weightedWeekCompletionCounts, type WeightableTask } from "@/lib/effort-weight";
import { DailyProgressCard } from "@/components/daily-progress-card";
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
