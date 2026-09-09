"use client";

import { cn } from "@/lib/utils";
import type { CoachingSession } from "../../dashboard/types";

const DAY_LABELS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

export function MonthCalendar({
  grid,
  todayIso,
  sessionsByDate,
  onSelectDay,
}: {
  grid: { date: string; dayOfMonth: number; inMonth: boolean }[];
  todayIso: string;
  sessionsByDate: Map<string, CoachingSession[]>;
  onSelectDay: (date: string) => void;
}) {
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <div className="bg-secondary text-muted-foreground grid grid-cols-7 text-center text-xs font-medium">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="border-border divide-border grid grid-cols-7 divide-x divide-y border-t">
        {grid.map((cell) => {
          const daySessions = sessionsByDate.get(cell.date) ?? [];
          const pending = daySessions.filter((s) => s.outcome === "pending").length;
          const completed = daySessions.filter((s) => s.outcome === "completed").length;
          const missed = daySessions.filter((s) => s.outcome === "not_happened").length;
          const isToday = cell.date === todayIso;

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => daySessions.length > 0 && onSelectDay(cell.date)}
              disabled={daySessions.length === 0}
              className={cn(
                "flex min-h-[84px] flex-col items-start gap-1 p-2 text-left transition-colors",
                !cell.inMonth && "bg-muted/30 text-muted-foreground",
                daySessions.length > 0 && "hover:bg-accent/40 cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  isToday && "bg-primary text-primary-foreground rounded-full px-1.5 py-0.5",
                )}
              >
                {cell.dayOfMonth}
              </span>
              <div className="flex flex-wrap gap-1">
                {pending > 0 && (
                  <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    {pending} Planlanan
                  </span>
                )}
                {completed > 0 && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    {completed} Gerçekleşen
                  </span>
                )}
                {missed > 0 && (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                    {missed} Gerçekleşmeyen
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
