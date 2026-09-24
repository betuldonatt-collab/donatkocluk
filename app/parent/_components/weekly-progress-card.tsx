import { cn } from "@/lib/utils";

export type WeekProgress = { start: string; end: string; pct: number | null };

function fmt(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
}

// Two stacked rows: last week as a finished, muted record; this week as
// the live, still-filling metric. Deliberately no red/amber/green
// thresholds here -- an ongoing week is naturally partial, and a red bar
// on a Wednesday is exactly the parent/student friction this avoids.
export function WeeklyProgressCard({ previous, current }: { previous: WeekProgress; current: WeekProgress }) {
  return (
    <div className="space-y-5">
      <div className="opacity-80">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground font-medium">
              Geçen Hafta: {fmt(previous.start)} - {fmt(previous.end)}
            </span>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">Tamamlandı</span>
          </div>
          <span className="text-muted-foreground text-sm font-semibold tabular-nums">
            {previous.pct === null ? "—" : `%${previous.pct}`}
          </span>
        </div>
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div className="bg-muted-foreground/50 h-full rounded-full" style={{ width: `${previous.pct ?? 0}%` }} />
        </div>
        {previous.pct === null && <p className="text-muted-foreground mt-1 text-xs">Bu hafta için program girilmemişti.</p>}
      </div>

      <div className="border-primary/25 bg-primary/5 rounded-lg border p-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-foreground font-semibold">
              Bu Hafta: {fmt(current.start)} - {fmt(current.end)}
            </span>
            <span className="bg-primary/15 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
              <span className="bg-primary size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
              Devam Ediyor
            </span>
          </div>
          <span className="text-foreground text-base font-semibold tabular-nums">
            {current.pct === null ? "—" : `%${current.pct}`}
          </span>
        </div>
        <div className="bg-muted h-2.5 overflow-hidden rounded-full">
          <div
            className={cn("bg-primary h-full rounded-full transition-all", current.pct === null && "w-0")}
            style={{ width: `${current.pct ?? 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
