import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChurnBreakdownItem } from "../types";

function ChurnBar({ item, total }: { item: ChurnBreakdownItem; total: number }) {
  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{item.label}</span>
        <span className="text-foreground font-semibold tabular-nums">
          {item.count} · %{pct}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CategoryBreakdown({
  items,
  inactiveCount,
}: {
  items: ChurnBreakdownItem[];
  inactiveCount: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ayrılış / Kayıp Analizi</CardTitle>
        <CardDescription>
          {inactiveCount === 0
            ? "Henüz ayrılan öğrenci yok."
            : "Öğrencilerin ayrılış nedenlerine göre dağılımı — makro eğilimleri görmek içindir."}
        </CardDescription>
      </CardHeader>
      {inactiveCount > 0 && (
        <CardContent className="space-y-3">
          {items.map((item) => (
            <ChurnBar key={item.category} item={item} total={inactiveCount} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
