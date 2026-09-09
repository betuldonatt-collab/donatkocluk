import Link from "next/link";

type PoolStudent = { id: string; full_name: string | null };
type NearingStudent = { id: string; full_name: string | null; completedCount: number };

export function RenewalRadar({
  quotaCompleted,
  nearingCompletion,
}: {
  quotaCompleted: PoolStudent[];
  nearingCompletion: NearingStudent[];
}) {
  if (quotaCompleted.length === 0 && nearingCompletion.length === 0) {
    return <p className="text-muted-foreground text-sm">Yenileme gerektiren öğrenci yok.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="border-border rounded-lg border p-4">
        <p className="text-foreground mb-2 text-sm font-semibold">Kotası Doldu, Yenileme Bekliyor</p>
        {quotaCompleted.length === 0 ? (
          <p className="text-muted-foreground text-sm">Yok</p>
        ) : (
          <div className="space-y-1.5">
            {quotaCompleted.map((s) => (
              <Link
                key={s.id}
                href="/admin/students"
                className="text-foreground hover:text-primary block text-sm underline-offset-2 hover:underline"
              >
                {s.full_name ?? "(İsimsiz)"}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="border-border rounded-lg border p-4">
        <p className="text-foreground mb-2 text-sm font-semibold">4+ Görüşme Tamamladı</p>
        {nearingCompletion.length === 0 ? (
          <p className="text-muted-foreground text-sm">Yok</p>
        ) : (
          <div className="space-y-1.5">
            {nearingCompletion.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{s.full_name ?? "(İsimsiz)"}</span>
                <span className="text-muted-foreground text-xs">{s.completedCount} görüşme</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
