import { cn } from "@/lib/utils";

export function CompletionBar({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-semibold tabular-nums">{pct === null ? "—" : `%${pct}`}</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct === null ? "w-0" : pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
