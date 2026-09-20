"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { NetSummary } from "@/lib/karne";
import { LineChart } from "../../_components/charts/line-chart";

export type KarneListItem = {
  id: string;
  cycle_number: number;
  range_start: string;
  range_end: string;
  approved_at: string | null;
  stats: NetSummary;
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// approved_at is a full timestamptz (unlike the date-only range_start/range_end),
// so it must not get a second "T00:00:00" appended.
function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function KarneListClient({ cycles }: { cycles: KarneListItem[] }) {
  // Oldest-first for a left-to-right timeline (cycles itself stays
  // newest-first, matching the list below). Each track's own null cycles
  // (no exam of that type that period) are skipped independently rather
  // than coerced to 0, so a missing AYT period doesn't read as a crash to
  // zero on the chart. RLS already scopes `cycles` to approved rows only
  // (see page.tsx's own comment), so no status filter needed here.
  const cyclesAsc = cycles.slice().reverse();
  const tytTrend = cyclesAsc.filter((c) => c.stats.tyt.current !== null).map((c) => ({ date: c.range_start, value: c.stats.tyt.current! }));
  const lgsTrend = cyclesAsc.filter((c) => c.stats.lgs?.current != null).map((c) => ({ date: c.range_start, value: c.stats.lgs!.current! }));
  const isLgsCohort = lgsTrend.length > 0 || cycles.some((c) => c.stats.lgs != null);
  const aytTrend = cyclesAsc.filter((c) => c.stats.ayt.current !== null).map((c) => ({ date: c.range_start, value: c.stats.ayt.current! }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Karnelerim</h2>
        <p className="text-muted-foreground text-sm">Koçunun onayladığı dönemsel karnelerin burada listelenir.</p>
      </div>

      {cycles.length > 0 && (
        isLgsCohort ? (
          <div className="border-border bg-card rounded-lg border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">LGS Net Gelişimi</p>
            <LineChart data={lgsTrend} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="border-border bg-card rounded-lg border p-4">
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">TYT Net Gelişimi</p>
              <LineChart data={tytTrend} />
            </div>
            <div className="border-border bg-card rounded-lg border p-4">
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">AYT Net Gelişimi</p>
              <LineChart data={aytTrend} color="#f59e0b" />
            </div>
          </div>
        )
      )}

      {cycles.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz onaylanmış bir karnen yok.</p>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => (
            <Link
              key={cycle.id}
              href={`/student/deneme-analizleri/karne/${cycle.id}`}
              className="border-border bg-card hover:bg-accent/40 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
            >
              <div>
                <p className="text-foreground text-sm font-semibold">{cycle.cycle_number}. Dönem</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(cycle.range_start)} – {formatDate(cycle.range_end)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cycle.approved_at && (
                  <span className="text-muted-foreground text-xs">{formatTimestamp(cycle.approved_at)} tarihinde onaylandı</span>
                )}
                <ChevronRight className="text-muted-foreground size-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
