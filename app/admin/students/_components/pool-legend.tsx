import { Info } from "lucide-react";

const LEGEND_ITEMS = [
  {
    label: "Yeni Kayıt - Bekliyor",
    color: "bg-emerald-500/15 text-emerald-700",
    description: "Öğrenci sisteme kaydoldu ancak henüz hiç koça atanmadı.",
  },
  {
    label: "Pasif - Yenileme Bekliyor",
    color: "bg-amber-500/15 text-amber-700",
    description: "Öğrenci görüşme kotasını tamamladığı için otomatik olarak koçundan ayrıldı; yenileme bekleniyor.",
  },
  {
    label: "Pasif - Devamsız",
    color: "bg-rose-500/15 text-rose-700",
    description: "Öğrenci devamsızlık nedeniyle admin tarafından koçundan manuel olarak ayrıldı.",
  },
];

export function PoolLegend() {
  return (
    <div className="border-border bg-muted/30 rounded-lg border p-4">
      <p className="text-foreground mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Info className="size-4" />
        Rozet Açıklamaları
      </p>
      <div className="space-y-2">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-start gap-2">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${item.color}`}>{item.label}</span>
            <p className="text-muted-foreground text-xs">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
