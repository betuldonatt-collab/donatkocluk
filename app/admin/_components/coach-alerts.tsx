import Link from "next/link";
import { AlertTriangle } from "lucide-react";

type CoachAlert = {
  id: string;
  full_name: string | null;
  isOffline: boolean;
  lowChecklist: boolean;
  checklistPct: number | null;
  delayedCount: number;
};

export function CoachAlerts({ alerts }: { alerts: CoachAlert[] }) {
  if (alerts.length === 0) {
    return <p className="text-muted-foreground text-sm">Kriz sinyali yok.</p>;
  }

  return (
    <div className="space-y-3">
      {alerts.map((coach) => (
        <Link
          key={coach.id}
          href={`/admin/coaches/${coach.id}`}
          className="border-border hover:bg-accent/40 block rounded-lg border p-4 transition-colors"
        >
          <p className="text-foreground mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="text-rose-600 size-4" />
            {coach.full_name ?? "(İsimsiz)"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {coach.isOffline && (
              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                2 Gündür Giriş Yapmadı
              </span>
            )}
            {coach.lowChecklist && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Düşük Checklist ({coach.checklistPct}%)
              </span>
            )}
            {coach.delayedCount > 0 && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Gecikmiş Bilgilendirme ({coach.delayedCount})
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
