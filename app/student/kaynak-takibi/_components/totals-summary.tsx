"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ResourceTotals = { total: number; correct: number; wrong: number; empty: number };

// Kaynak Takibi is a general roadmap, not a period view -- this used to
// offer a Bugün/Bu Hafta toggle backed by a separate student_daily_stats
// query, while the per-topic table below it was always an all-time
// student_tasks aggregate. The two were never connected, so the toggle
// only ever moved this card while the topic rows (and the always-visible
// Karma row) stayed put -- looking like only Karma/totals "responded."
// Removed the toggle and switched this card to read the exact same
// all-time totals as the table below, so there's one source of truth
// and nothing left to disagree.
export function TotalsSummary({ totals }: { totals: ResourceTotals }) {
  return (
    <div className="border-border bg-muted/30 flex flex-col items-center gap-3 rounded-lg border p-4">
      <Tooltip
        content={
          <div className="space-y-0.5">
            <p>Toplam: {totals.total}</p>
            <p>Doğru: {totals.correct}</p>
            <p>Yanlış: {totals.wrong}</p>
            <p>Boş: {totals.empty}</p>
          </div>
        }
      >
        <div className="cursor-default text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Toplam Soru</p>
          <p className="text-foreground text-3xl font-bold tabular-nums">{totals.total}</p>
        </div>
      </Tooltip>

      <div className="flex flex-wrap justify-center gap-2">
        <StatBadge label="Doğru" value={totals.correct} tone="green" />
        <StatBadge label="Yanlış" value={totals.wrong} tone="red" />
        <StatBadge label="Boş" value={totals.empty} tone="amber" />
      </div>
    </div>
  );
}

const TONE_CLASSES = {
  green: "bg-emerald-500/15 text-emerald-700",
  red: "bg-rose-500/15 text-rose-700",
  amber: "bg-amber-500/15 text-amber-700",
} as const;

export function StatBadge({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE_CLASSES }) {
  return (
    <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", TONE_CLASSES[tone])}>
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
