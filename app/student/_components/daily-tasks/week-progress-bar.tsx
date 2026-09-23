"use client";

import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { completionCounts, completionPercent, completionStart, weekCompletionCounts } from "@/lib/completion";
import type { StudentTask } from "./types";

// Two different views of the same lock-timestamp start rule (lib/
// completion.ts), one per tab -- see TaskBoard, which mounts exactly one
// of these per view instead of one bar shared across both:
//   "today" -- under Bugün. "Micro" view (completionCounts): counts only
//     through today, so tomorrow's tasks aren't in the denominator yet.
//     Headed by today's own date + day name (e.g. "24 Eylül Perşembe").
//   "week"  -- under Bu Hafta. "Macro" view (weekCompletionCounts): counts
//     the WHOLE locked week through Sunday, future days included in the
//     denominator from day one -- the total is fixed for the week and
//     only ever climbs toward 100% as tasks get done, it never grows
//     day by day the way the "today" view's own total does.
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
  const counts = variant === "today" ? completionCounts(tasks, today, lockedAt) : weekCompletionCounts(tasks, today, lockedAt);
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
          variant === "today" ? "Bugüne kadar tamamlaman gereken görev yok." : "Bu hafta için henüz atanmış görev yok."
        ) : complete ? (
          <>
            <Trophy className="size-3.5 shrink-0 text-emerald-600" />
            <span className="font-medium text-emerald-700">
              {variant === "today" ? "Harika! Bugüne kadarki tüm görevlerini tamamladın." : "Harika! Bu haftanın tüm görevlerini tamamladın."}
            </span>
          </>
        ) : variant === "today" ? (
          <>
            {counts.done}/{counts.total} görev tamam · {since} tarihinden bugüne kadar
          </>
        ) : (
          <>
            {counts.done}/{counts.total} görev tamam · {since} tarihinden bu haftanın sonuna kadar
          </>
        )}
      </p>
    </div>
  );
}
