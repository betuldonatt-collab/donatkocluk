import { cn } from "@/lib/utils";

// completed/remaining are already scoped to the student's current quota
// cycle by the caller (app/parent/page.tsx) -- this component just renders
// whatever numbers it's given.
export function SessionQuotaStats({
  completed,
  total,
  remaining,
  unpaidCompleted = 0,
}: {
  completed: number;
  total: number;
  remaining: number;
  unpaidCompleted?: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2.5">
      <div className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-1.5">
        <span className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums">
          {completed}
        </span>
        <span className="text-muted-foreground text-xs font-medium">Tamamlanan Görüşme</span>
      </div>

      <div className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-1.5">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums",
            remaining > 0 ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700",
          )}
        >
          {remaining}
        </span>
        <span className="text-muted-foreground text-xs font-medium">Kalan Görüşme Hakkı</span>
      </div>

      {unpaidCompleted > 0 && (
        <p className="text-muted-foreground basis-full text-xs">
          {unpaidCompleted} tamamlanan görüşmenin ödemesi henüz kaydedilmedi; bu yüzden kalan hak eksiye düşebilir.
        </p>
      )}

      {total > 0 && (
        <div className="flex min-w-28 flex-1 basis-32 items-center gap-2">
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
            {completed}/{total}
          </span>
        </div>
      )}
    </div>
  );
}
