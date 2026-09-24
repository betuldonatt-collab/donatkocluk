"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function WeekNavigator({
  weekStart,
  weekEnd,
  isCurrentWeek,
}: {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
}) {
  const router = useRouter();

  function goTo(dateIso: string) {
    router.push(`/coach/dashboard?week=${dateIso}`);
  }

  const rangeLabel = `${new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} – ${new Date(`${weekEnd}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Button type="button" variant="outline" size="icon" onClick={() => goTo(addDaysISO(weekStart, -7))} aria-label="Önceki hafta">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-foreground min-w-0 flex-1 text-center sm:min-w-[220px] sm:flex-none text-sm font-medium">{rangeLabel}</span>
        <Button type="button" variant="outline" size="icon" onClick={() => goTo(addDaysISO(weekStart, 7))} aria-label="Sonraki hafta">
          <ChevronRight className="size-4" />
        </Button>
        {!isCurrentWeek && (
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/coach/dashboard")}>
            Bu Hafta
          </Button>
        )}
      </div>
      <input
        type="date"
        value={weekStart}
        onChange={(e) => e.target.value && goTo(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        aria-label="Belirli bir haftaya git"
      />
    </div>
  );
}
