"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function addMonthsISO(monthStr: string, months: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Same pattern as the Görüşmelerim page's own MonthNavigator, duplicated
// (not imported across routes) since that one hardcodes /coach/sessions.
export function MonthNavigator({ month, isCurrentMonth }: { month: string; isCurrentMonth: boolean }) {
  const router = useRouter();

  function goTo(monthStr: string) {
    router.push(`/coach/stats?month=${monthStr}`);
  }

  const [y, m] = month.split("-").map(Number);
  const label = `${MONTH_LABELS[m - 1]} ${y}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" size="icon" onClick={() => goTo(addMonthsISO(month, -1))} aria-label="Önceki ay">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-foreground min-w-0 flex-1 text-center sm:min-w-[160px] sm:flex-none text-sm font-medium">{label}</span>
      <Button type="button" variant="outline" size="icon" onClick={() => goTo(addMonthsISO(month, 1))} aria-label="Sonraki ay">
        <ChevronRight className="size-4" />
      </Button>
      {!isCurrentMonth && (
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/coach/stats")}>
          Bu Ay
        </Button>
      )}
    </div>
  );
}
